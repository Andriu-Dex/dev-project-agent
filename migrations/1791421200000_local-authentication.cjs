exports.up = (pgm) => {
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    login: { type: 'text', notNull: true, unique: true, check: "login ~ '^[a-z0-9][a-z0-9._-]{2,63}$'" },
    display_name: { type: 'text', notNull: true },
    password_hash: { type: 'text', notNull: true },
    active: { type: 'boolean', notNull: true, default: true },
    auth_version: { type: 'integer', notNull: true, default: 1, check: 'auth_version > 0' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('project_memberships', {
    project_id: { type: 'uuid', notNull: true, references: 'projects', onDelete: 'RESTRICT' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'RESTRICT' },
    role: { type: 'text', notNull: true, check: "role IN ('manager', 'viewer')" },
    active: { type: 'boolean', notNull: true, default: true },
  });
  pgm.addConstraint('project_memberships', 'project_memberships_pkey', { primaryKey: ['project_id', 'user_id'] });
  pgm.createIndex('project_memberships', 'user_id');
  pgm.createTable('sessions', {
    id: { type: 'text', primaryKey: true },
    user_id: { type: 'uuid', references: 'users', onDelete: 'RESTRICT' },
    payload: { type: 'jsonb', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
    revoked_at: { type: 'timestamptz' },
  });
  pgm.createIndex('sessions', 'user_id');
  pgm.createIndex('sessions', 'expires_at');
  pgm.addColumns('audit_events', {
    actor_id: { type: 'uuid', references: 'users', onDelete: 'RESTRICT' },
  });
  pgm.sql("INSERT INTO projects (name) SELECT 'UTAPED' WHERE NOT EXISTS (SELECT 1 FROM projects)");
  pgm.sql('GRANT SELECT ON users, project_memberships TO dev_project_agent_app');
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON sessions TO dev_project_agent_app');
};
exports.down = (pgm) => {
  pgm.dropColumns('audit_events', ['actor_id']);
  pgm.dropTable('sessions');
  pgm.dropTable('project_memberships');
  pgm.dropTable('users');
};
