-- The part of an Adjustment Factor that shows as a price jump: the factor itself,
-- except that a rights issue whose issue price is at or above the prior close
-- (factor of 1 or less) expects none. Jump matching (#0006) compares against this,
-- not against `factor`. Rebuilt on every build.
ALTER TABLE adjusted.adjustment_factor
  ADD COLUMN jump_num numeric,
  ADD COLUMN jump_den numeric;
UPDATE adjusted.adjustment_factor SET jump_num = factor_num, jump_den = factor_den;
ALTER TABLE adjusted.adjustment_factor
  ALTER COLUMN jump_num SET NOT NULL,
  ALTER COLUMN jump_den SET NOT NULL;
