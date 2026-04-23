ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_type_check;
UPDATE properties SET type = 'multi-family' WHERE type NOT IN ('multi-family');
ALTER TABLE properties ADD CONSTRAINT properties_type_check CHECK (type IN ('multi-family'));
