PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brain_regions (
    id TEXT PRIMARY KEY,
    hemisphere TEXT NOT NULL CHECK (hemisphere IN ('lh', 'rh')),
    label_index INTEGER NOT NULL CHECK (label_index > 0),
    name TEXT NOT NULL,
    name_zh TEXT NOT NULL,
    atlas TEXT NOT NULL DEFAULT 'Destrieux a2009s',
    description TEXT NOT NULL DEFAULT '',
    UNIQUE (hemisphere, label_index)
);

CREATE TABLE IF NOT EXISTS cognitive_functions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#b28aff'
);

CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    year INTEGER NOT NULL CHECK (year BETWEEN 1800 AND 2200),
    journal TEXT NOT NULL DEFAULT '',
    doi TEXT COLLATE NOCASE UNIQUE,
    url TEXT NOT NULL DEFAULT '',
    abstract TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    source_kind TEXT NOT NULL DEFAULT 'user' CHECK (source_kind IN ('demo', 'user')),
    citation_verified INTEGER NOT NULL DEFAULT 0 CHECK (citation_verified IN (0, 1)),
    evidence_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paper_authors (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    name TEXT NOT NULL,
    PRIMARY KEY (paper_id, position)
);

CREATE TABLE IF NOT EXISTS taxonomies (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL REFERENCES taxonomies(id),
    label TEXT NOT NULL,
    UNIQUE (category, label)
);

CREATE TABLE IF NOT EXISTS paper_tags (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (paper_id, tag_id)
);

-- Animation JSON contains presentation parameters, never executable code.
CREATE TABLE IF NOT EXISTS animations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'illustration',
    config_json TEXT NOT NULL DEFAULT '{}',
    is_illustrative INTEGER NOT NULL DEFAULT 1 CHECK (is_illustrative IN (0, 1))
);

CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    paradigm TEXT NOT NULL DEFAULT '',
    task_description TEXT NOT NULL DEFAULT '',
    modality TEXT NOT NULL DEFAULT '',
    sample_size INTEGER CHECK (sample_size IS NULL OR sample_size > 0),
    population TEXT NOT NULL DEFAULT '',
    stimulus TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms > 0),
    animation_id TEXT REFERENCES animations(id),
    position INTEGER NOT NULL DEFAULT 0,
    UNIQUE (id, paper_id)
);

CREATE TABLE IF NOT EXISTS experiment_conditions (
    experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (experiment_id, position)
);

CREATE TABLE IF NOT EXISTS findings (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    experiment_id TEXT,
    region_id TEXT NOT NULL REFERENCES brain_regions(id),
    metric TEXT NOT NULL DEFAULT '',
    effect_direction TEXT NOT NULL DEFAULT 'unspecified',
    summary TEXT NOT NULL CHECK (length(trim(summary)) > 0),
    mechanism TEXT NOT NULL DEFAULT '',
    evidence_type TEXT NOT NULL DEFAULT 'association',
    mapping_status TEXT NOT NULL DEFAULT 'provisional'
        CHECK (mapping_status IN ('accepted', 'provisional')),
    mapping_source TEXT NOT NULL CHECK (length(trim(mapping_source)) > 0),
    mapping_confidence REAL NOT NULL DEFAULT 0.5
        CHECK (mapping_confidence >= 0 AND mapping_confidence <= 1),
    source_locator TEXT NOT NULL DEFAULT '',
    limitations TEXT NOT NULL DEFAULT '',
    animation_id TEXT REFERENCES animations(id),
    position INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (experiment_id, paper_id) REFERENCES experiments(id, paper_id)
);

CREATE TABLE IF NOT EXISTS finding_functions (
    finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
    function_id TEXT NOT NULL REFERENCES cognitive_functions(id),
    PRIMARY KEY (finding_id, function_id)
);

CREATE INDEX IF NOT EXISTS idx_findings_region ON findings(region_id);
CREATE INDEX IF NOT EXISTS idx_findings_paper ON findings(paper_id);
CREATE INDEX IF NOT EXISTS idx_findings_mapping ON findings(mapping_status);
CREATE INDEX IF NOT EXISTS idx_finding_functions_function ON finding_functions(function_id, finding_id);
CREATE INDEX IF NOT EXISTS idx_experiments_paper ON experiments(paper_id);
CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year);
CREATE INDEX IF NOT EXISTS idx_paper_tags_tag ON paper_tags(tag_id, paper_id);
