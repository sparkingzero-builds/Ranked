-- Ranked v16: form pictures are now cropped headshots (hosted in public/forms). Everyone else back to their AniList picture.
update characters set image = base_image, form = null where base_image is not null and form is not null;
update characters c set image = v.img, form = v.form from (values
  (5, 'https://sparkingzero-builds.github.io/Ranked/forms/5.jpg', 'Bankai'),
  (40, 'https://sparkingzero-builds.github.io/Ranked/forms/40.jpg', 'Gear 5'),
  (246, 'https://sparkingzero-builds.github.io/Ranked/forms/246.jpg', 'Ultra Instinct'),
  (909, 'https://sparkingzero-builds.github.io/Ranked/forms/909.jpg', 'Bankai'),
  (913, 'https://sparkingzero-builds.github.io/Ranked/forms/913.jpg', 'Ultra Ego'),
  (914, 'https://sparkingzero-builds.github.io/Ranked/forms/914.jpg', 'Orange Piccolo'),
  (1081, 'https://sparkingzero-builds.github.io/Ranked/forms/1081.jpg', 'Resurrección'),
  (1086, 'https://sparkingzero-builds.github.io/Ranked/forms/1086.jpg', 'Hōgyoku'),
  (2535, 'https://sparkingzero-builds.github.io/Ranked/forms/2535.jpg', 'Kurama Mode'),
  (2707, 'https://sparkingzero-builds.github.io/Ranked/forms/2707.jpg', 'Super Saiyan'),
  (5187, 'https://sparkingzero-builds.github.io/Ranked/forms/5187.jpg', 'Dragon Force'),
  (32893, 'https://sparkingzero-builds.github.io/Ranked/forms/32893.jpg', 'Fire Fist'),
  (53901, 'https://sparkingzero-builds.github.io/Ranked/forms/53901.jpg', 'Six Paths'),
  (89028, 'https://sparkingzero-builds.github.io/Ranked/forms/89028.jpg', 'Full Cowl'),
  (89220, 'https://sparkingzero-builds.github.io/Ranked/forms/89220.jpg', 'Half-Cold Half-Hot'),
  (123283, 'https://sparkingzero-builds.github.io/Ranked/forms/123283.jpg', 'Valkyrie Armor'),
  (126071, 'https://sparkingzero-builds.github.io/Ranked/forms/126071.jpg', 'Demon Slayer Mark'),
  (129131, 'https://sparkingzero-builds.github.io/Ranked/forms/129131.jpg', 'Thunder Breathing'),
  (129133, 'https://sparkingzero-builds.github.io/Ranked/forms/129133.jpg', 'Flame Breathing'),
  (130050, 'https://sparkingzero-builds.github.io/Ranked/forms/130050.jpg', 'Demon Slayer Mark'),
  (133701, 'https://sparkingzero-builds.github.io/Ranked/forms/133701.jpg', 'True Form'),
  (136069, 'https://sparkingzero-builds.github.io/Ranked/forms/136069.jpg', 'Demon Slayer Mark'),
  (136071, 'https://sparkingzero-builds.github.io/Ranked/forms/136071.jpg', 'Sound Breathing'),
  (141694, 'https://sparkingzero-builds.github.io/Ranked/forms/141694.jpg', 'Upper Rank Three')
) v(id, img, form) where c.id = v.id;
select count(*) filter (where form is not null) forms from characters;
