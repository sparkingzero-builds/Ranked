-- Ranked v19: add Chihiro Rokuhira (Kagurabachi) and Frieza to the market. Run after v18.sql.
-- Prices follow the collector's import formula: p0 = 2000 + sqrt(fans) * 30, base = 15 + sqrt(fans) / 2.2
insert into characters (id, name, sym, image, favourites, media_title, color, wiki_title, manga_id, manga_title, manga_status, p0, base, power, price, price_24h)
values
  (314801, 'Chihiro Rokuhira', 'CHIHIR', 'https://s4.anilist.co/file/anilistcdn/character/large/b314801-MvuHiyPe5Dxu.png', 1156, 'Kagurabachi', '#d6351a',
   'Kagurabachi', 169355, 'Kagurabachi', 'RELEASING', 3020, 30.45, 3020, 30.45, 30.45),
  (3694, 'Frieza', 'FRIEZA', 'https://s4.anilist.co/file/anilistcdn/character/large/b3694-bDfOdSSdFfPv.png', 1480, 'Dragon Ball Z', '#e49343',
   'Frieza', null, null, null, 3154, 32.49, 3154, 32.49, 32.49)
on conflict (id) do nothing;
insert into news (char_id, up, source, text) values
  (314801, true, 'trending', 'NEW LISTING: $CHIHIR (Chihiro Rokuhira, Kagurabachi) hits the market'),
  (3694, true, 'trending', 'NEW LISTING: $FRIEZA hits the market');
select id, name, sym, price from characters where id in (314801, 3694);
