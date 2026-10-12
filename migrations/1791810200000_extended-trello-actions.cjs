exports.up = pgm => {
  pgm.alterColumn('proposal_versions','requested_due',{notNull:false});
};
exports.down = pgm => {
  pgm.sql("DO $$ BEGIN IF EXISTS(SELECT 1 FROM proposal_versions WHERE requested_due IS NULL) THEN RAISE EXCEPTION 'Non-date proposals must be retained; downgrade is not possible'; END IF; END $$");
  pgm.alterColumn('proposal_versions','requested_due',{notNull:true});
};
