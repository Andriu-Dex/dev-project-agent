exports.up=pgm=>pgm.addColumn('audit_events',{details:{type:'jsonb'}});
exports.down=pgm=>pgm.dropColumn('audit_events','details');
