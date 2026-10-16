exports.up = pgm => {
  pgm.createTable('trello_connections', {
    project_id: { type: 'uuid', primaryKey: true, references: 'projects', onDelete: 'RESTRICT' },
    board_id: { type: 'text', notNull: true },
    operational_list_ids: { type: 'jsonb', notNull: true },
  });
  pgm.createTable('trello_snapshots', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    project_id: { type: 'uuid', notNull: true, references: 'trello_connections', onDelete: 'RESTRICT' },
    source: { type: 'text', notNull: true, check: "source IN ('api', 'export')" },
    observed_at: { type: 'timestamptz', notNull: true },
    imported_at: { type: 'timestamptz', notNull: true, default: pgm.func('clock_timestamp()') },
    data: { type: 'jsonb', notNull: true },
    changes: { type: 'jsonb', notNull: true },
  });
  pgm.createIndex('trello_snapshots', ['project_id', 'imported_at']);
  pgm.createTable('trello_sync_attempts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    project_id: { type: 'uuid', notNull: true, references: 'trello_connections', onDelete: 'RESTRICT' },
    status: { type: 'text', notNull: true, check: "status IN ('succeeded', 'failed')" },
    attempted_at: { type: 'timestamptz', notNull: true, default: pgm.func('clock_timestamp()') },
    error_code: { type: 'text' },
  });
  pgm.sql(`INSERT INTO trello_connections (project_id, board_id, operational_list_ids)
    SELECT id, '6a95a200128aa8ce9dd216c0', '["6a95a221128aa8ce9dd25398","6a95a221128aa8ce9dd253aa","6a95a221128aa8ce9dd25408","6ac29f5b0e457eb5d56b31b1","6a95a221128aa8ce9dd25420","6a95a222128aa8ce9dd25438"]'::jsonb
    FROM projects WHERE name = 'UTAPED' ORDER BY created_at, id LIMIT 1`);
  pgm.sql('GRANT SELECT ON trello_connections TO dev_project_agent_app');
  pgm.sql('GRANT SELECT, INSERT ON trello_snapshots, trello_sync_attempts TO dev_project_agent_app');
};
exports.down = pgm => {
  pgm.dropTable('trello_sync_attempts');
  pgm.dropTable('trello_snapshots');
  pgm.dropTable('trello_connections');
};
