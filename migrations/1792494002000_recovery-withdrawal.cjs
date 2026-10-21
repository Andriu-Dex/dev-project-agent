exports.up = pgm => pgm.sql(`
  ALTER TABLE github_recovery_requests DROP CONSTRAINT github_recovery_requests_status_check;
  ALTER TABLE github_recovery_requests ADD CONSTRAINT github_recovery_requests_status_check
    CHECK(status IN ('prepared','approved','running','succeeded','reconciliation_required','withdrawn'));
`);
exports.down = pgm => pgm.sql(`
  ALTER TABLE github_recovery_requests DROP CONSTRAINT github_recovery_requests_status_check;
  ALTER TABLE github_recovery_requests ADD CONSTRAINT github_recovery_requests_status_check
    CHECK(status IN ('prepared','approved','running','succeeded','reconciliation_required'));
`);
