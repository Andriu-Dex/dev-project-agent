exports.up = pgm => {
  pgm.createTable('tracking_policy_versions', {
    project_id: { type: 'uuid', notNull: true, references: 'projects', onDelete: 'RESTRICT' },
    version: { type: 'integer', notNull: true, check: 'version > 0' },
    due_soon_hours: { type: 'integer', notNull: true, check: 'due_soon_hours BETWEEN 1 AND 720' },
    stale_after_minutes: { type: 'integer', notNull: true, check: 'stale_after_minutes BETWEEN 1 AND 10080' },
    confirmed: { type: 'boolean', notNull: true },
    changed_at: { type: 'timestamptz', notNull: true, default: pgm.func('clock_timestamp()') },
    changed_by: { type: 'uuid', references: 'users', onDelete: 'RESTRICT' },
  });
  pgm.addConstraint('tracking_policy_versions', 'tracking_policy_versions_pkey', { primaryKey: ['project_id', 'version'] });
  pgm.sql('INSERT INTO tracking_policy_versions (project_id, version, due_soon_hours, stale_after_minutes, confirmed) SELECT id, 1, 72, 60, false FROM projects');
  pgm.sql('GRANT SELECT, INSERT ON tracking_policy_versions TO dev_project_agent_app');
};
exports.down = pgm => { pgm.dropTable('tracking_policy_versions'); };
