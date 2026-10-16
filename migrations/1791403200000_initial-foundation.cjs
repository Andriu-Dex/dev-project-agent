exports.up = (pgm) => {
  pgm.createTable('projects', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    time_zone: { type: 'text', notNull: true, default: 'America/Guayaquil' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('audit_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    project_id: { type: 'uuid', references: 'projects', notNull: true, onDelete: 'RESTRICT' },
    actor_type: { type: 'text', notNull: true, check: "actor_type IN ('user', 'agent', 'system')" },
    action: { type: 'text', notNull: true },
    resource_type: { type: 'text', notNull: true },
    resource_id: { type: 'text', notNull: true },
    outcome: { type: 'text', notNull: true },
    correlation_id: { type: 'uuid' },
    occurred_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('audit_events', ['project_id', 'occurred_at']);
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON projects TO dev_project_agent_app');
  pgm.sql('GRANT SELECT, INSERT ON audit_events TO dev_project_agent_app');
};
exports.down = (pgm) => {
  pgm.dropTable('audit_events');
  pgm.dropTable('projects');
};
