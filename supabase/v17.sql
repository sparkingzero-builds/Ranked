-- Ranked v17: Luffy and Minato back to their AniList pictures.
update characters set image = base_image, form = null where id in (40, 2535);
select id, name, form, image from characters where id in (40, 2535);
