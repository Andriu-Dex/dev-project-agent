exports.up = pgm => {
  pgm.addColumns('tracking_policy_versions', {
    priority_labels: { type: 'jsonb', notNull: true, default: '{}' },
    blocked_labels: { type: 'jsonb', notNull: true, default: '[]' },
    state_labels: { type: 'jsonb', notNull: true, default: '{"PENDIENTE":"pending","EN CURSO":"in_progress","COMPLETADA":"completed"}' },
  });
  pgm.sql("ALTER TABLE tracking_policy_versions ADD CONSTRAINT tracking_label_types CHECK (jsonb_typeof(priority_labels)='object' AND jsonb_typeof(blocked_labels)='array' AND jsonb_typeof(state_labels)='object')");
};
exports.down = pgm => {
  pgm.dropConstraint('tracking_policy_versions', 'tracking_label_types');
  pgm.dropColumns('tracking_policy_versions', ['priority_labels','blocked_labels','state_labels']);
};
