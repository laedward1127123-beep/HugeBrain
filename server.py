#!/usr/bin/env python3
"""HugeBrain local HTTP server. Python standard library; persistent SQLite data."""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import sqlite3
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit
import uuid

ROOT = Path(__file__).resolve().parent
DEFAULT_DB = ROOT / "data" / "hugebrain.db"
MAX_BODY = 2 * 1024 * 1024
ID_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{1,160}$")
TAXONOMIES = {
    "domain": "认知领域", "function": "认知功能", "paradigm": "实验范式",
    "method": "研究方法", "modality": "测量模态", "population": "研究人群",
    "stimulus": "刺激类型", "metric": "提取指标", "analysis": "分析方法",
    "evidence": "证据类型", "design": "实验设计", "species": "物种",
    "network": "脑网络", "sample": "样本特征", "limitation": "局限性",
    "replication": "重复验证", "availability": "数据开放性",
}


class ValidationError(ValueError):
    pass


def connect(db_path: Path | str = DEFAULT_DB) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def as_text(value, name, *, required=False, maximum=30000):
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValidationError(f"{name} must be a string")
    value = value.strip()
    if required and not value:
        raise ValidationError(f"{name} is required")
    if len(value) > maximum:
        raise ValidationError(f"{name} exceeds {maximum} characters")
    return value


def as_id(value, name, default=None):
    value = value if value is not None else default
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        raise ValidationError(f"{name} must be a valid identifier")
    return value


def as_list(value, name, maximum=2000):
    if not isinstance(value, list) or len(value) > maximum:
        raise ValidationError(f"{name} must be an array of at most {maximum} items")
    return value


def as_int(value, name, low, high, optional=False):
    if optional and value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise ValidationError(f"{name} must be an integer between {low} and {high}")
    return value


def normalize_doi(value):
    value = as_text(value, "doi", maximum=500)
    value = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", value, flags=re.I)
    if value and (not value.startswith("10.") or "/" not in value or any(c.isspace() for c in value)):
        raise ValidationError("doi must be a DOI such as 10.1038/example")
    return value or None


def validate_animation(value, name):
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValidationError(f"{name} must be an object")
    try:
        encoded = json.dumps(value, allow_nan=False, ensure_ascii=False)
    except (TypeError, ValueError):
        raise ValidationError(f"{name} must contain valid JSON values") from None
    if len(encoded) > 30000:
        raise ValidationError(f"{name} is too large")
    as_text(value.get("type", "illustration"), f"{name}.type", required=True, maximum=100)
    return value


def validate_paper(conn, value, *, source_kind="user"):
    if not isinstance(value, dict):
        raise ValidationError("paper must be a JSON object")
    paper_id = as_id(value.get("id"), "id", f"paper_{uuid.uuid4().hex}")
    citation_verified = value.get("citation_verified", False)
    if not isinstance(citation_verified, bool):
        raise ValidationError("citation_verified must be a boolean")
    paper = {
        "id": paper_id, "title": as_text(value.get("title"), "title", required=True, maximum=2000),
        "year": as_int(value.get("year"), "year", 1800, 2200),
        "doi": normalize_doi(value.get("doi")), "source_kind": source_kind,
        "citation_verified": citation_verified,
    }
    for key in ("journal", "url", "abstract", "summary", "evidence_note"):
        paper[key] = as_text(value.get(key), key)
    if paper["url"] and urlsplit(paper["url"]).scheme not in ("http", "https"):
        raise ValidationError("url must use http or https")
    paper["authors"] = [as_text(v, "authors item", required=True, maximum=300)
                        for v in as_list(value.get("authors", []), "authors", 500)]
    paper["tags"] = []
    seen_tags = set()
    for tag in as_list(value.get("tags", []), "tags", 300):
        if not isinstance(tag, dict):
            raise ValidationError("each tag must contain category and label")
        category = as_text(tag.get("category"), "tag.category", required=True, maximum=100)
        label = as_text(tag.get("label"), "tag.label", required=True, maximum=250)
        if (category, label) not in seen_tags:
            paper["tags"].append({"category": category, "label": label})
            seen_tags.add((category, label))
    paper["experiments"] = []
    experiment_ids = set()
    for index, exp in enumerate(as_list(value.get("experiments", []), "experiments", 100)):
        if not isinstance(exp, dict):
            raise ValidationError("each experiment must be an object")
        experiment_id = as_id(exp.get("id"), "experiment.id", f"{paper_id}_exp_{index + 1}")
        if experiment_id in experiment_ids:
            raise ValidationError("experiment ids must be unique")
        experiment_ids.add(experiment_id)
        item = {"id": experiment_id}
        for key in ("name", "paradigm", "task_description", "modality", "population", "stimulus"):
            item[key] = as_text(exp.get(key), f"experiment.{key}")
        item["name"] = item["name"] or f"Experiment {index + 1}"
        item["sample_size"] = as_int(exp.get("sample_size"), "experiment.sample_size", 1, 10000000, optional=True)
        item["duration_ms"] = as_int(exp.get("duration_ms"), "experiment.duration_ms", 1, 100000000, optional=True)
        item["conditions"] = [as_text(c, "experiment.condition", required=True, maximum=1000)
                              for c in as_list(exp.get("conditions", []), "experiment.conditions", 100)]
        item["animation"] = validate_animation(exp.get("animation"), "experiment.animation")
        paper["experiments"].append(item)
    region_ids = {r[0] for r in conn.execute("SELECT id FROM brain_regions")}
    function_ids = {r[0] for r in conn.execute("SELECT id FROM cognitive_functions")}
    paper["findings"] = []
    finding_ids = set()
    for index, finding in enumerate(as_list(value.get("findings", []), "findings", 1500)):
        if not isinstance(finding, dict):
            raise ValidationError("each finding must be an object")
        finding_id = as_id(finding.get("id"), "finding.id", f"{paper_id}_finding_{index + 1}")
        if finding_id in finding_ids:
            raise ValidationError("finding ids must be unique")
        finding_ids.add(finding_id)
        item = {"id": finding_id, "experiment_id": finding.get("experiment_id")}
        if item["experiment_id"] is not None and item["experiment_id"] not in experiment_ids:
            raise ValidationError("finding.experiment_id must belong to this paper")
        item["region_id"] = as_id(finding.get("region_id"), "finding.region_id")
        if item["region_id"] not in region_ids:
            raise ValidationError(f"unknown region_id: {item['region_id']}")
        item["function_ids"] = list(dict.fromkeys(as_id(f, "finding.function_id") for f in
                                                as_list(finding.get("function_ids", []), "finding.function_ids", 100)))
        if any(f not in function_ids for f in item["function_ids"]):
            raise ValidationError("finding references an unknown cognitive function")
        for key in ("metric", "effect_direction", "summary", "mechanism", "evidence_type", "mapping_source",
                    "source_locator", "limitations"):
            item[key] = as_text(finding.get(key), f"finding.{key}", required=key in ("summary", "mapping_source"))
        item["effect_direction"] = item["effect_direction"] or "unspecified"
        item["evidence_type"] = item["evidence_type"] or "association"
        item["mapping_status"] = finding.get("mapping_status", "provisional")
        if item["mapping_status"] not in ("provisional", "accepted"):
            raise ValidationError("finding.mapping_status must be provisional or accepted")
        confidence = finding.get("mapping_confidence", 0.5)
        if isinstance(confidence, bool) or not isinstance(confidence, (float, int)) or not 0 <= confidence <= 1:
            raise ValidationError("finding.mapping_confidence must be between 0 and 1")
        item["mapping_confidence"] = confidence
        item["animation"] = validate_animation(finding.get("animation"), "finding.animation")
        paper["findings"].append(item)
    return paper


def insert_animation(conn, animation, owner_id):
    if not animation:
        return None
    animation_id = f"animation_{owner_id}"
    conn.execute("INSERT INTO animations (id, type, config_json, is_illustrative) VALUES (?, ?, ?, ?)",
                 (animation_id, animation.get("type", "illustration"),
                  json.dumps(animation, ensure_ascii=False, allow_nan=False), int(animation.get("illustrative", True))))
    return animation_id


def insert_paper(conn, raw_paper, *, source_kind="user"):
    """Caller owns transaction; validation completes before any paper is inserted."""
    paper = validate_paper(conn, raw_paper, source_kind=source_kind)
    fields = ("id", "title", "year", "journal", "doi", "url", "abstract", "summary", "source_kind",
              "citation_verified", "evidence_note")
    conn.execute(f"INSERT INTO papers ({','.join(fields)}) VALUES ({','.join('?' for _ in fields)})",
                 tuple(paper[k] for k in fields))
    conn.executemany("INSERT INTO paper_authors (paper_id, position, name) VALUES (?, ?, ?)",
                     ((paper["id"], i, name) for i, name in enumerate(paper["authors"])))
    for tag in paper["tags"]:
        category, label = tag["category"], tag["label"]
        conn.execute("INSERT OR IGNORE INTO taxonomies (id, label) VALUES (?, ?)",
                     (category, TAXONOMIES.get(category, category)))
        tag_id = "tag_" + hashlib.sha256(f"{category}\0{label}".encode()).hexdigest()[:24]
        conn.execute("INSERT OR IGNORE INTO tags (id, category, label) VALUES (?, ?, ?)", (tag_id, category, label))
        tag_id = conn.execute("SELECT id FROM tags WHERE category = ? AND label = ?", (category, label)).fetchone()[0]
        conn.execute("INSERT INTO paper_tags (paper_id, tag_id) VALUES (?, ?)", (paper["id"], tag_id))
    for i, exp in enumerate(paper["experiments"]):
        animation_id = insert_animation(conn, exp["animation"], exp["id"])
        fields = ("id", "name", "paradigm", "task_description", "modality", "sample_size", "population", "stimulus", "duration_ms")
        conn.execute(f"INSERT INTO experiments ({','.join(fields)},paper_id,animation_id,position) "
                     f"VALUES ({','.join('?' for _ in range(len(fields) + 3))})",
                     tuple(exp[k] for k in fields) + (paper["id"], animation_id, i))
        conn.executemany("INSERT INTO experiment_conditions (experiment_id, position, label) VALUES (?, ?, ?)",
                         ((exp["id"], j, c) for j, c in enumerate(exp["conditions"])))
    for i, finding in enumerate(paper["findings"]):
        animation_id = insert_animation(conn, finding["animation"], finding["id"])
        fields = ("id", "experiment_id", "region_id", "metric", "effect_direction", "summary", "mechanism",
                  "evidence_type", "mapping_status", "mapping_source", "mapping_confidence", "source_locator", "limitations")
        conn.execute(f"INSERT INTO findings ({','.join(fields)},paper_id,animation_id,position) "
                     f"VALUES ({','.join('?' for _ in range(len(fields) + 3))})",
                     tuple(finding[k] for k in fields) + (paper["id"], animation_id, i))
        conn.executemany("INSERT INTO finding_functions (finding_id, function_id) VALUES (?, ?)",
                         ((finding["id"], f) for f in finding["function_ids"]))
    return paper["id"]


def initialize(db_path=DEFAULT_DB, regions_path=None, seed_path=None):
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    regions_path = Path(regions_path) if regions_path else ROOT / "public/data/regions.json"
    seed_path = Path(seed_path) if seed_path else ROOT / "database/seed.json"
    conn = connect(db_path)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript((ROOT / "database/schema.sql").read_text())
        with conn:
            conn.execute("INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('schema_version', '1')")
            conn.executemany("INSERT OR IGNORE INTO taxonomies (id, label) VALUES (?, ?)", TAXONOMIES.items())
            if regions_path.exists():
                regions = json.loads(regions_path.read_text())
                if isinstance(regions, dict):
                    regions = regions["regions"]
                for region in regions:
                    conn.execute("INSERT OR IGNORE INTO brain_regions "
                                 "(id, hemisphere, label_index, name, name_zh, atlas, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
                                 (region["id"], region["hemisphere"], region["label_index"], region["name"],
                                  region.get("name_zh", region["name"]), region.get("atlas", "Destrieux a2009s"),
                                  region.get("description", "")))
            if seed_path.exists() and not conn.execute("SELECT value FROM app_metadata WHERE key='seed_loaded'").fetchone():
                seed = json.loads(seed_path.read_text())
                for func in seed.get("functions", []):
                    conn.execute("INSERT OR IGNORE INTO cognitive_functions (id, name, description, color) VALUES (?, ?, ?, ?)",
                                 (func["id"], func["name"], func.get("description", ""), func.get("color", "#b28aff")))
                if conn.execute("SELECT COUNT(*) FROM papers").fetchone()[0] == 0:
                    for paper in seed.get("papers", []):
                        insert_paper(conn, paper, source_kind="demo")
                conn.execute("INSERT INTO app_metadata (key, value) VALUES ('seed_loaded', '1')")
    finally:
        conn.close()


def rows(conn, sql, params=()):
    return [dict(row) for row in conn.execute(sql, params)]


def get_animation(conn, animation_id):
    if not animation_id:
        return {}
    result = conn.execute("SELECT config_json FROM animations WHERE id=?", (animation_id,)).fetchone()
    return json.loads(result[0]) if result else {}


def get_findings(conn, paper_id=None, region_id=None, mapping="all", function_id=None):
    conditions, params = [], []
    for key, value in (("paper_id", paper_id), ("region_id", region_id)):
        if value is not None:
            conditions.append(f"{key}=?")
            params.append(value)
    if mapping not in ("all", "accepted", "provisional"):
        raise ValidationError("mapping must be all, accepted, or provisional")
    if mapping != "all":
        conditions.append("mapping_status=?")
        params.append(mapping)
    if function_id:
        conditions.append("EXISTS (SELECT 1 FROM finding_functions ff WHERE ff.finding_id=findings.id AND ff.function_id=?)")
        params.append(function_id)
    where = " WHERE " + " AND ".join(conditions) if conditions else ""
    result = rows(conn, "SELECT * FROM findings" + where + " ORDER BY position,id", params)
    for finding in result:
        finding["animation"] = get_animation(conn, finding.pop("animation_id"))
        finding["function_ids"] = [r[0] for r in conn.execute(
            "SELECT function_id FROM finding_functions WHERE finding_id=? ORDER BY function_id", (finding["id"],))]
        finding.pop("position")
    return result


def get_paper(conn, paper_id):
    result = conn.execute("SELECT * FROM papers WHERE id=?", (paper_id,)).fetchone()
    if result is None:
        return None
    paper = dict(result)
    paper["citation_verified"] = bool(paper["citation_verified"])
    paper["authors"] = [r[0] for r in conn.execute(
        "SELECT name FROM paper_authors WHERE paper_id=? ORDER BY position", (paper_id,))]
    paper["tags"] = rows(conn, "SELECT t.id,t.category,t.label FROM tags t JOIN paper_tags pt ON t.id=pt.tag_id "
                         "WHERE pt.paper_id=? ORDER BY t.category,t.label", (paper_id,))
    paper["experiments"] = rows(conn, "SELECT * FROM experiments WHERE paper_id=? ORDER BY position,id", (paper_id,))
    for exp in paper["experiments"]:
        exp["conditions"] = [r[0] for r in conn.execute(
            "SELECT label FROM experiment_conditions WHERE experiment_id=? ORDER BY position", (exp["id"],))]
        exp["animation"] = get_animation(conn, exp.pop("animation_id"))
        exp.pop("position")
    paper["findings"] = get_findings(conn, paper_id=paper_id)
    return paper


def filter_papers(conn, query):
    conditions, params = [], []
    finding_conditions, finding_params = [], []
    for key, column in (("region", "f.region_id"), ("function", "ff.function_id")):
        if query.get(key):
            finding_conditions.append(f"{column}=?")
            finding_params.append(query[key])
    mapping = query.get("mapping", "all")
    if mapping not in ("all", "accepted", "provisional"):
        raise ValidationError("mapping must be all, accepted, or provisional")
    if mapping != "all":
        finding_conditions.append("f.mapping_status=?")
        finding_params.append(mapping)
    if finding_conditions:
        conditions.append("EXISTS (SELECT 1 FROM findings f LEFT JOIN finding_functions ff ON f.id=ff.finding_id "
                          "WHERE f.paper_id=p.id AND " + " AND ".join(finding_conditions) + ")")
        params.extend(finding_params)
    if query.get("q"):
        term = "%" + query["q"].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        conditions.append("(p.title LIKE ? ESCAPE '\\' OR p.summary LIKE ? ESCAPE '\\' OR p.abstract LIKE ? ESCAPE '\\' "
                          "OR p.doi LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM paper_authors a WHERE a.paper_id=p.id AND a.name LIKE ? ESCAPE '\\') "
                          "OR EXISTS (SELECT 1 FROM paper_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.paper_id=p.id AND t.label LIKE ? ESCAPE '\\'))")
        params.extend([term] * 6)
    year_bounds = {}
    for key, operator in (("year_from", ">="), ("year_to", "<=")):
        if query.get(key):
            try:
                year = int(query[key])
            except (ValueError, TypeError):
                raise ValidationError(f"{key} must be an integer") from None
            year_bounds[key] = as_int(year, key, 1800, 2200)
            conditions.append(f"p.year {operator} ?")
            params.append(year)
    if year_bounds.get("year_from", 1800) > year_bounds.get("year_to", 2200):
        raise ValidationError("year_from cannot be later than year_to")
    if query.get("method"):
        conditions.append("(EXISTS (SELECT 1 FROM experiments e WHERE e.paper_id=p.id AND lower(e.modality)=lower(?)) "
                          "OR EXISTS (SELECT 1 FROM paper_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.paper_id=p.id "
                          "AND t.category IN ('method','modality','analysis','研究方法','采集模态','分析方法') AND lower(t.label)=lower(?)))")
        params.extend([query["method"]] * 2)
    where = " WHERE " + " AND ".join(conditions) if conditions else ""
    paper_ids = [r[0] for r in conn.execute("SELECT p.id FROM papers p" + where + " ORDER BY p.year DESC,p.title,p.id", params)]
    return [get_paper(conn, paper_id) for paper_id in paper_ids]


def heatmap(conn, function_id=None, mapping="all"):
    if mapping not in ("all", "accepted", "provisional"):
        raise ValidationError("mapping must be all, accepted, or provisional")
    clauses, params = [], []
    if function_id:
        clauses.append("ff.function_id=?")
        params.append(function_id)
    if mapping != "all":
        clauses.append("f.mapping_status=?")
        params.append(mapping)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    selection = " FROM findings f LEFT JOIN finding_functions ff ON ff.finding_id=f.id" + where
    counted = rows(conn, "SELECT f.region_id,COUNT(DISTINCT f.paper_id) AS count,"
                   "COUNT(DISTINCT CASE WHEN f.mapping_status='accepted' THEN f.paper_id END) AS accepted_count,"
                   "COUNT(DISTINCT CASE WHEN f.mapping_status='provisional' THEN f.paper_id END) AS provisional_count"
                   + selection + " GROUP BY f.region_id", params)
    by_id = {item["region_id"]: item for item in counted}
    counts = [by_id.get(r[0], {"region_id": r[0], "count": 0, "accepted_count": 0, "provisional_count": 0})
              for r in conn.execute("SELECT id FROM brain_regions ORDER BY hemisphere,label_index")]
    totals = conn.execute("SELECT COUNT(DISTINCT f.paper_id),"
                          "COUNT(DISTINCT CASE WHEN f.mapping_status='accepted' THEN f.paper_id END),"
                          "COUNT(DISTINCT CASE WHEN f.mapping_status='provisional' THEN f.paper_id END)" + selection, params).fetchone()
    return {"counts": counts, "max_count": max((c["count"] for c in counts), default=0),
            "total_papers": totals[0], "accepted_papers": totals[1], "provisional_papers": totals[2],
            "mapping_scope": mapping, "function_id": function_id,
            "counting_unit": "distinct_papers", "note": "Paper counts describe coverage, not effect size or certainty."}


def bootstrap(conn):
    regions = rows(conn, "SELECT * FROM brain_regions ORDER BY hemisphere,label_index")
    functions = rows(conn, "SELECT * FROM cognitive_functions ORDER BY rowid")
    stats = {key: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for key, table in
             (("papers", "papers"), ("regions", "brain_regions"), ("functions", "cognitive_functions"), ("findings", "findings"))}
    for status in ("accepted", "provisional"):
        stats[f"{status}_mappings"] = conn.execute("SELECT COUNT(*) FROM findings WHERE mapping_status=?", (status,)).fetchone()[0]
    stats["demo_papers"] = conn.execute("SELECT COUNT(*) FROM papers WHERE source_kind='demo'").fetchone()[0]
    return {"regions": regions, "functions": functions, "papers": filter_papers(conn, {}),
            "tags": rows(conn, "SELECT * FROM tags ORDER BY category,label"), "stats": stats}


class HugeBrainServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, db_path=DEFAULT_DB, static_root=None):
        self.db_path = Path(db_path)
        self.static_root = Path(static_root or ROOT / "dist").resolve()
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    server_version = "HugeBrain/0.1"

    def send_bytes(self, status, body, content_type, extra_headers=None, head=False):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "no-cache")
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def send_json(self, status, data, extra_headers=None):
        self.send_bytes(status, json.dumps(data, ensure_ascii=False, allow_nan=False).encode(),
                        "application/json; charset=utf-8", extra_headers)

    def do_GET(self):
        parsed = urlsplit(self.path)
        path = unquote(parsed.path)
        if not path.startswith("/api/"):
            self.serve_static(path)
            return
        conn = connect(self.server.db_path)
        try:
            query = {k: values[-1] for k, values in parse_qs(parsed.query).items()}
            if path == "/api/health":
                self.send_json(200, {"status": "ok", "database": "sqlite", "schema_version": 1})
            elif path == "/api/bootstrap":
                self.send_json(200, bootstrap(conn))
            elif path == "/api/papers":
                papers = filter_papers(conn, query)
                self.send_json(200, {"papers": papers, "total": len(papers)})
            elif path.startswith("/api/papers/"):
                paper = get_paper(conn, path[len("/api/papers/"):])
                self.send_json(200 if paper else 404, paper or {"error": "Paper not found"})
            elif path.startswith("/api/regions/"):
                region_id = path[len("/api/regions/"):]
                region = conn.execute("SELECT * FROM brain_regions WHERE id=?", (region_id,)).fetchone()
                if region is None:
                    self.send_json(404, {"error": "Region not found"})
                else:
                    region_query = dict(query, region=region_id)
                    self.send_json(200, {"region": dict(region), "papers": filter_papers(conn, region_query),
                                         "findings": get_findings(conn, region_id=region_id,
                                                                  mapping=query.get("mapping", "all"),
                                                                  function_id=query.get("function"))})
            elif path == "/api/heatmap":
                self.send_json(200, heatmap(conn, query.get("function"), query.get("mapping", "all")))
            elif path == "/api/export":
                data = bootstrap(conn)
                data.update({"schema_version": 1, "exported_at": datetime.now(timezone.utc).isoformat(),
                             "taxonomies": rows(conn, "SELECT * FROM taxonomies ORDER BY id")})
                self.send_json(200, data, {"Content-Disposition": 'attachment; filename="hugebrain-export.json"'})
            else:
                self.send_json(404, {"error": "Endpoint not found"})
        except ValidationError as exc:
            self.send_json(400, {"error": str(exc)})
        except sqlite3.Error:
            self.log_error("Database query failed")
            self.send_json(500, {"error": "Database query failed"})
        finally:
            conn.close()

    def do_POST(self):
        if urlsplit(self.path).path != "/api/papers":
            self.send_json(404, {"error": "Endpoint not found"})
            return
        origin = self.headers.get("Origin")
        if origin and urlsplit(origin).netloc != self.headers.get("Host"):
            self.send_json(403, {"error": "Cross-origin writes are not allowed"})
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0].strip() != "application/json":
            self.send_json(415, {"error": "Content-Type must be application/json"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(400, {"error": "Invalid Content-Length"})
            return
        if not 0 < length <= MAX_BODY:
            self.send_json(413 if length > MAX_BODY else 400, {"error": "Request body must be 1 byte to 2 MiB"})
            return
        conn = connect(self.server.db_path)
        try:
            raw = json.loads(self.rfile.read(length), parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Invalid JSON number")))
            with conn:
                paper_id = insert_paper(conn, raw)
            self.send_json(201, get_paper(conn, paper_id), {"Location": f"/api/papers/{paper_id}"})
        except (ValidationError, json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
            self.send_json(400, {"error": str(exc)})
        except sqlite3.IntegrityError:
            self.send_json(409, {"error": "A paper DOI, record ID, or child record ID already exists; nothing was imported"})
        except sqlite3.Error:
            self.log_error("Database write failed")
            self.send_json(500, {"error": "Database write failed; nothing was imported"})
        finally:
            conn.close()

    def serve_static(self, path, head=False):
        root = self.server.static_root
        try:
            candidate = (root / path.lstrip("/")).resolve()
            candidate.relative_to(root)
        except (ValueError, OSError):
            self.send_bytes(403, b"Forbidden", "text/plain", head=head)
            return
        if candidate.is_dir():
            candidate = candidate / "index.html"
        if not candidate.exists() and "." not in Path(path).name:
            candidate = root / "index.html"
        try:
            candidate = candidate.resolve()
            candidate.relative_to(root)
        except (ValueError, OSError):
            self.send_bytes(403, b"Forbidden", "text/plain", head=head)
            return
        if not candidate.is_file():
            status = 503 if not (root / "index.html").exists() else 404
            self.send_bytes(status, b"Frontend not built. Run npm install and npm run build." if status == 503 else b"Not found",
                            "text/plain; charset=utf-8", head=head)
            return
        self.send_bytes(200, candidate.read_bytes(), mimetypes.guess_type(candidate.name)[0] or "application/octet-stream", head=head)

    def do_HEAD(self):
        path = unquote(urlsplit(self.path).path)
        if path.startswith("/api/"):
            self.send_bytes(405, b"", "text/plain", {"Allow": "GET, POST"}, head=True)
        else:
            self.serve_static(path, head=True)


def main():
    parser = argparse.ArgumentParser(description="Run the local HugeBrain application")
    parser.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")))
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()
    initialize(args.db)
    server = HugeBrainServer((args.host, args.port), args.db)
    print(f"HugeBrain running at http://{args.host}:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
