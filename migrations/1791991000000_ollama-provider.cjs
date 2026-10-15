exports.up = pgm => {
  pgm.addColumn('provider_evaluations', {
    provider: { type: 'text', notNull: true, default: 'chatgpt' },
  });
  pgm.createIndex('provider_evaluations', ['project_id', 'provider', 'created_at']);
};

exports.down = pgm => {
  pgm.dropIndex('provider_evaluations', ['project_id', 'provider', 'created_at']);
  pgm.dropColumn('provider_evaluations', 'provider');
};

