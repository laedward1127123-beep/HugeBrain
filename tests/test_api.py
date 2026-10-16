import copy
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def fixture_paper(paper_id, year=2009):
    return {
        "id": paper_id, "title": f"Visual memory {paper_id}", "year": year,
        "authors": ["A. Researcher"], "journal": "Example journal", "doi": f"10.1000/{paper_id}",
        "url": f"https://doi.org/10.1000/{paper_id}", "summary": "工作记忆证据示例",
        "tags": [{"category": "method", "label": "fMRI"}, {"category": "analysis", "label": "MVPA"}],
        "experiments": [{"id": f"{paper_id}_e1", "name": "Memory task", "modality": "fMRI",
                         "conditions": ["low load", "high load"], "sample_size": 12,
                         "animation": {"type": "delayed-match", "illustrative": True}}],
        "findings": [{"id": f"{paper_id}_f1", "experiment_id": f"{paper_id}_e1", "region_id": "lh_45",
                      "function_ids": ["working-memory", "attention"], "metric": "decoding accuracy",
                      "summary": "Stimulus information can be decoded.", "mapping_status": "provisional",
                      "mapping_source": "Anatomical label approximation", "mapping_confidence": 0.4,
                      "animation": {"type": "decoding", "illustrative": True}}],
    }


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.db = self.root / "test.db"
        registry = [
            {"id": "lh_45", "hemisphere": "lh", "label_index": 45, "name": "S_calcarine", "name_zh": "距状沟"},
            {"id": "rh_15", "hemisphere": "rh", "label_index": 15, "name": "G_front_middle", "name_zh": "额中回"},
            {"id": "lh_57", "hemisphere": "lh", "label_index": 57, "name": "S_intrapariet", "name_zh": "顶内沟"},
        ]
        self.registry_path = self.root / "regions.json"
        self.registry_path.write_text(json.dumps(registry))
        p1 = fixture_paper("p1")
        duplicate = copy.deepcopy(p1["findings"][0])
        duplicate["id"] = "p1_duplicate_finding"
        p1["findings"].append(duplicate)
        different_region = copy.deepcopy(duplicate)
        different_region.update(id="p1_control", region_id="rh_15", function_ids=["cognitive-control"])
        p1["findings"].append(different_region)
        p2 = fixture_paper("p2", 2001)
        p2["findings"][0]["mapping_status"] = "accepted"
        p2["findings"][0]["mapping_source"] = "Test-only confirmed mapping"
        self.seed_path = self.root / "seed.json"
        self.seed_path.write_text(json.dumps({"functions": [
            {"id": "working-memory", "name": "工作记忆"},
            {"id": "attention", "name": "注意"},
            {"id": "cognitive-control", "name": "认知控制"}], "papers": [p1, p2]}))
        server.initialize(self.db, self.registry_path, self.seed_path)
        self.static = self.root / "dist"
        self.static.mkdir()
        (self.static / "index.html").write_text("<html>HugeBrain</html>")
        (self.root / "secret.txt").write_text("PRIVATE")
        self.httpd = server.HugeBrainServer(("127.0.0.1", 0), self.db, self.static)
        self.httpd.RequestHandlerClass.log_message = lambda *_: None
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.httpd.server_port}"

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)
        self.temp.cleanup()

    def request(self, path, body=None, headers=None):
        request_headers = {"Content-Type": "application/json"}
        request_headers.update(headers or {})
        request = Request(self.url + path, data=json.dumps(body).encode() if body is not None else None,
                          headers=request_headers)
        try:
            response = urlopen(request, timeout=3)
        except HTTPError as exc:
            response = exc
        data = response.read()
        if "application/json" in response.headers.get("Content-Type", ""):
            data = json.loads(data)
        return response.status, data

    def test_distinct_paper_heatmap_and_explicit_mapping_scope(self):
        status, data = self.request("/api/heatmap?function=working-memory")
        self.assertEqual(status, 200)
        self.assertEqual(data["total_papers"], 2)
        counts = {x["region_id"]: x for x in data["counts"]}
        self.assertEqual(counts["lh_45"]["count"], 2)  # two findings and two function links still count once
        self.assertEqual(counts["lh_45"]["provisional_count"], 1)
        self.assertEqual(counts["lh_45"]["accepted_count"], 1)
        self.assertEqual(counts["lh_57"]["count"], 0)
        self.assertEqual(data["max_count"], 2)
        _, accepted = self.request("/api/heatmap?function=working-memory&mapping=accepted")
        self.assertEqual(accepted["total_papers"], 1)
        self.assertEqual(accepted["provisional_papers"], 0)
        self.assertEqual(accepted["mapping_scope"], "accepted")

    def test_filter_combination_matches_same_finding(self):
        _, mismatch = self.request("/api/papers?region=rh_15&function=working-memory")
        self.assertEqual(mismatch["total"], 0)
        _, matches = self.request("/api/papers?region=lh_45&function=working-memory&year_from=2005&method=fMRI")
        self.assertEqual([p["id"] for p in matches["papers"]], ["p1"])
        _, by_author = self.request("/api/papers?q=Researcher&year_to=2002")
        self.assertEqual([p["id"] for p in by_author["papers"]], ["p2"])
        _, by_tag = self.request("/api/papers?q=MVPA")
        self.assertEqual(by_tag["total"], 2)

    def test_zero_unknown_invalid_and_injection_queries(self):
        _, empty = self.request("/api/heatmap?function=missing")
        self.assertEqual(empty["total_papers"], 0)
        self.assertEqual(empty["max_count"], 0)
        self.assertTrue(all(x["count"] == 0 for x in empty["counts"]))
        self.assertEqual(self.request("/api/regions/missing")[0], 404)
        self.assertEqual(self.request("/api/papers/missing")[0], 404)
        self.assertEqual(self.request("/api/papers?year_from=bad")[0], 400)
        self.assertEqual(self.request("/api/papers?year_from=2010&year_to=2000")[0], 400)
        self.assertEqual(self.request("/api/heatmap?mapping=unreviewed")[0], 400)
        _, injection = self.request("/api/papers?region=%27%20OR%201%3D1--")
        self.assertEqual(injection["total"], 0)
        _, wildcard = self.request("/api/papers?q=%25")
        self.assertEqual(wildcard["total"], 0)

    def test_create_roundtrip_and_persistence(self):
        paper = fixture_paper("new_paper")
        paper["tags"].append({"category": "自定义标签", "label": "经过复核"})
        status, created = self.request("/api/papers", paper)
        self.assertEqual(status, 201)
        self.assertEqual(created["source_kind"], "user")
        self.assertEqual(created["authors"], paper["authors"])
        self.assertEqual(created["experiments"][0]["conditions"], ["low load", "high load"])
        self.assertEqual(created["findings"][0]["animation"]["type"], "decoding")
        self.assertTrue(any(t["label"] == "经过复核" for t in created["tags"]))
        server.initialize(self.db, self.registry_path, self.seed_path)
        _, data = self.request("/api/bootstrap")
        self.assertEqual(data["stats"]["papers"], 3)
        self.assertEqual(data["stats"]["demo_papers"], 2)
        self.assertEqual(self.request("/api/papers/new_paper")[1]["title"], paper["title"])

    def test_duplicate_doi_and_mid_transaction_failure_rollback(self):
        duplicate = fixture_paper("duplicate")
        duplicate["doi"] = "https://doi.org/10.1000/P1"
        self.assertEqual(self.request("/api/papers", duplicate)[0], 409)
        collision = fixture_paper("collision")
        collision["experiments"][0]["id"] = "p1_e1"
        collision["findings"][0]["experiment_id"] = "p1_e1"
        collision["tags"].append({"category": "should-rollback", "label": "temporary tag"})
        self.assertEqual(self.request("/api/papers", collision)[0], 409)
        with server.connect(self.db) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM papers").fetchone()[0], 2)
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM taxonomies WHERE id='should-rollback'").fetchone()[0], 0)
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM animations").fetchone()[0], 6)

    def test_validation_and_cross_origin_write_rejection(self):
        for field, value in (("region_id", "lh_999"), ("mapping_confidence", "low"),
                             ("mapping_confidence", -1), ("mapping_source", ""),
                             ("experiment_id", "other_paper_experiment"), ("function_ids", ["unknown"])):
            paper = fixture_paper("invalid")
            paper["findings"][0][field] = value
            self.assertEqual(self.request("/api/papers", paper)[0], 400, field)
        self.assertEqual(self.request("/api/papers", fixture_paper("external"),
                                      {"Origin": "https://unrelated.example"})[0], 403)
        self.assertEqual(self.request("/api/papers", fixture_paper("wrong_type"),
                                      {"Content-Type": "text/plain"})[0], 415)
        with server.connect(self.db) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM papers").fetchone()[0], 2)

    def test_export_region_and_static_boundaries(self):
        status, export = self.request("/api/export")
        self.assertEqual(status, 200)
        self.assertEqual(export["schema_version"], 1)
        self.assertEqual(len(export["papers"]), 2)
        self.assertIn("taxonomies", export)
        _, region = self.request("/api/regions/lh_45")
        self.assertEqual(region["region"]["name_zh"], "距状沟")
        self.assertEqual(len(region["findings"]), 3)
        _, reviewed = self.request("/api/regions/lh_45?mapping=accepted&function=working-memory")
        self.assertEqual(len(reviewed["papers"]), 1)
        self.assertEqual(len(reviewed["findings"]), 1)
        self.assertEqual(self.request("/")[1], b"<html>HugeBrain</html>")
        self.assertEqual(self.request("/%2e%2e/secret.txt")[0], 403)
        self.assertEqual(self.request("/data/hugebrain.db")[0], 404)

    def test_database_constraints_and_foreign_keys(self):
        with server.connect(self.db) as conn:
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute("INSERT INTO finding_functions (finding_id,function_id) VALUES ('missing','attention')")
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute("INSERT INTO findings (id,paper_id,experiment_id,region_id,summary,mapping_source) "
                             "VALUES ('cross-paper','p1','p2_e1','lh_45','test','source')")
            self.assertEqual(conn.execute("PRAGMA foreign_key_check").fetchall(), [])


class ActualSeedTests(unittest.TestCase):
    def test_actual_seed_and_full_export_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "seed.db"
            server.initialize(db)
            with server.connect(db) as conn:
                original = server.bootstrap(conn)
                self.assertEqual(len(original["regions"]), 148)
                self.assertGreaterEqual(len(original["papers"]), 6)
                self.assertEqual(original["stats"]["accepted_mappings"], 0)
                self.assertGreater(original["stats"]["provisional_mappings"], 0)
                self.assertEqual(server.heatmap(conn, "working-memory")["total_papers"], 4)
                self.assertEqual(server.heatmap(conn, "working-memory", "accepted")["total_papers"], 0)
                self.assertEqual(conn.execute("PRAGMA foreign_key_check").fetchall(), [])
                conn.execute("DELETE FROM papers")
                conn.execute("DELETE FROM animations")
                for paper in original["papers"]:
                    server.insert_paper(conn, paper)
                restored = server.bootstrap(conn)
                for field in ("papers", "findings", "regions", "functions", "provisional_mappings"):
                    self.assertEqual(original["stats"][field], restored["stats"][field])
                for before, after in zip(original["papers"], restored["papers"]):
                    for field in ("title", "authors", "tags", "experiments", "findings"):
                        self.assertEqual(before[field], after[field])


if __name__ == "__main__":
    unittest.main()
