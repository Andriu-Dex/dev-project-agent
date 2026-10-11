exports.up=pgm=>pgm.sql('ALTER TABLE report_schedule_cursors ADD COLUMN error_code text');
exports.down=pgm=>pgm.dropColumn('report_schedule_cursors','error_code');
