-- Ranked v19: add Chihiro Rokuhira (Kagurabachi) to the market; Frieza was already listed as "Freeza", so rename him. Run after v18.sql.
-- Price follows the collector's import formula: p0 = 2000 + sqrt(fans) * 30, base = 15 + sqrt(fans) / 2.2
insert into characters (id, name, sym, image, favourites, media_title, color, wiki_title, manga_id, manga_title, manga_status, p0, base, power, price, price_24h)
values (314801, 'Chihiro Rokuhira', 'CHIROK', 'https://s4.anilist.co/file/anilistcdn/character/large/b314801-MvuHiyPe5Dxu.png', 1156, 'Kagurabachi', '#d6351a',
  'Kagurabachi', 169355, 'Kagurabachi', 'RELEASING', 3020, 30.45, 3020, 30.45, 30.45)
on conflict (id) do nothing;
insert into news (char_id, up, source, text) values (314801, true, 'trending', 'NEW LISTING: $CHIROK (Chihiro Rokuhira, Kagurabachi) hits the market');
update characters set name = 'Frieza' where id = 3694;
select id, name, sym, price from characters where id in (314801, 3694);
