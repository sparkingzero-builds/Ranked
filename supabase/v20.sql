-- Ranked v20: list 36 more popular characters (battle shonen + big names from Berserk, Tokyo Ghoul, Blue Lock, etc). Run after v19.sql.
-- Prices use the collector's import formula. A ticker that's already taken gets a number added.
do $$
declare r record; s text; n int;
begin
  for r in select * from (values
  (167, 'Yoh Asakura', 'YOH', 'https://s4.anilist.co/file/anilistcdn/character/large/b167-mVViZcSWQxDn.png', 1150, 'SHAMAN KING (2021)', '#fea150', 3017, 30.41),
  (454, 'Judeau', 'JUDEAU', 'https://s4.anilist.co/file/anilistcdn/character/large/b454-zAG2pjevq7OO.png', 1136, 'Berserk', '#d6861a', 3011, 30.32),
  (603, 'Integra Fairbrook Wingates Hellsing', 'INTEGR', 'https://s4.anilist.co/file/anilistcdn/character/large/n603-APJJRPduEnJV.jpg', 1389, 'Hellsing Ultimate', '#e4431a', 3118, 31.94),
  (5059, 'Serpico', 'SERPIC', 'https://s4.anilist.co/file/anilistcdn/character/large/b5059-wWVkoasyfJNk.png', 1116, 'Berserk', '#d6861a', 3002, 30.18),
  (5060, 'Puck', 'PUCK', 'https://s4.anilist.co/file/anilistcdn/character/large/b5060-PWn2hc2nBy9J.jpg', 1689, 'Berserk', '#d6861a', 3233, 33.68),
  (7857, 'Farnese de Vandimion', 'FARNES', 'https://s4.anilist.co/file/anilistcdn/character/large/b7857-W7WpcGlw2aeH.png', 1481, 'Berserk', '#d6861a', 3155, 32.49),
  (7864, 'Schierke', 'SCHIER', 'https://s4.anilist.co/file/anilistcdn/character/large/b7864-GYAwPktajKmt.png', 1349, 'Berserk', '#d6861a', 3102, 31.69),
  (7881, 'The Skull Knight', 'SKULLK', 'https://s4.anilist.co/file/anilistcdn/character/large/b7881-I6JM88ItFsnS.png', 1275, 'Berserk', '#d6861a', 3071, 31.23),
  (10499, 'Yujiro Hanma', 'YUJIRO', 'https://s4.anilist.co/file/anilistcdn/character/large/b10499-yqTyqgrkbZfO.jpg', 1535, 'BAKI', '#e4865d', 3175, 32.81),
  (28030, 'Einar', 'EINAR', 'https://s4.anilist.co/file/anilistcdn/character/large/b28030-APYJLr7FvqtM.jpg', 1389, 'Vinland Saga Season 2', '#e4a135', 3118, 31.94),
  (76816, 'Wakatoshi Ushijima', 'USHIJI', 'https://s4.anilist.co/file/anilistcdn/character/large/b76816-sS6LcPRxisQ9.png', 1658, 'HAIKYU!!', '#e48635', 3222, 33.51),
  (88407, 'Koutarou Amon', 'AMON', 'https://s4.anilist.co/file/anilistcdn/character/large/b88407-YwE6D75Xskxl.png', 1534, 'Tokyo Ghoul', '#ff6b35', 3175, 32.8),
  (88413, 'Rize Kamishiro', 'RIZE', 'https://s4.anilist.co/file/anilistcdn/character/large/b88413-FmAvV0hGSljG.png', 1443, 'Tokyo Ghoul', '#ff6b35', 3140, 32.27),
  (88424, 'Shuu Tsukiyama', 'TSUKIY', 'https://s4.anilist.co/file/anilistcdn/character/large/b88424-mFPgcZlCuODC.png', 1493, 'Tokyo Ghoul', '#ff6b35', 3159, 32.56),
  (89269, 'Hild', 'HILD', 'https://s4.anilist.co/file/anilistcdn/character/large/b89269-X04rdrY6AcMa.jpg', 1210, 'Vinland Saga', '#f16b43', 3044, 30.81),
  (89618, 'Ritsu Kageyama', 'RITSU', 'https://s4.anilist.co/file/anilistcdn/character/large/b89618-iSTUyCdu1yZ8.png', 1513, 'Mob Psycho 100', '#d65d1a', 3167, 32.68),
  (90231, 'Eto', 'ETO', 'https://s4.anilist.co/file/anilistcdn/character/large/b90231-7ZeFK1DbrAxw.jpg', 1436, 'Tokyo Ghoul √A', '#e47828', 3137, 32.22),
  (126031, 'Nimura Furuta', 'NIMURA', 'https://s4.anilist.co/file/anilistcdn/character/large/b126031-3tBpl6tvYwaZ.png', 1640, 'Tokyo Ghoul:re', '#282878', 3215, 33.41),
  (126069, 'Kaguya Ootsutsuki', 'KAGUYA', 'https://s4.anilist.co/file/anilistcdn/character/large/b126069-CYxn8C4AHwiD.png', 156, 'Naruto: Shippuden', '#e4865d', 2375, 20.68),
  (137267, 'Shion', 'SHIONH', 'https://s4.anilist.co/file/anilistcdn/character/large/b137267-D3mKSNS6H4o8.png', 1685, 'Hell’s Paradise', '#e4bb35', 3231, 33.66),
  (149797, 'Oden Kouzuki', 'ODEN', 'https://s4.anilist.co/file/anilistcdn/character/large/b149797-UmdR7up3kgoK.png', 1245, 'ONE PIECE', '#e49335', 3059, 31.04),
  (159840, 'Jack the Ripper', 'JACKR', 'https://s4.anilist.co/file/anilistcdn/character/large/b159840-MvF5LfHGiZdB.jpg', 1384, 'Record of Ragnarok', '#e47843', 3116, 31.91),
  (162214, 'Rensuke Kunigami', 'KUNIGA', 'https://s4.anilist.co/file/anilistcdn/character/large/b162214-9x9Q3A9rxpx8.png', 1472, 'BLUE LOCK', '#286be4', 3151, 32.44),
  (169394, 'Reo Mikage', 'REO', 'https://s4.anilist.co/file/anilistcdn/character/large/b169394-8KDqHUN1VyGC.png', 1274, 'BLUE LOCK', '#286be4', 3071, 31.22),
  (169397, 'Sae Itoshi', 'SAE', 'https://s4.anilist.co/file/anilistcdn/character/large/b169397-wC55onsv5u8t.jpg', 1206, 'BLUE LOCK', '#286be4', 3042, 30.79),
  (175945, 'Buddha', 'BUDDHA', 'https://s4.anilist.co/file/anilistcdn/character/large/b175945-3xQ22gud0QfO.jpg', 1570, 'Record of Ragnarok', null, 3189, 33.01),
  (180694, 'Reno Ichikawa', 'RENO', 'https://s4.anilist.co/file/anilistcdn/character/large/b180694-Q0Ocr4aqBu4k.png', 1595, 'Kaiju No. 8', '#f1e4ae', 3198, 33.15),
  (181846, 'Lucifero', 'LUCIFE', 'https://s4.anilist.co/file/anilistcdn/character/large/b181846-xm7ss9ZCWENV.png', 18, 'Black Clover', '#d6c96b', 2127, 16.93),
  (183889, 'Kikoru Shinomiya', 'KIKORU', 'https://s4.anilist.co/file/anilistcdn/character/large/b183889-2Ar6AHPx2mre.png', 1478, 'Kaiju No. 8', '#f1e4ae', 3153, 32.47),
  (186875, 'Ryuusei Shidou', 'SHIDOU', 'https://s4.anilist.co/file/anilistcdn/character/large/b186875-JGHisZO21JxJ.png', 1195, 'BLUE LOCK', '#286be4', 3037, 30.71),
  (196521, 'Shin Asakura', 'SHINAS', 'https://s4.anilist.co/file/anilistcdn/character/large/b196521-bedknWj9u7s2.png', 1431, 'SAKAMOTO DAYS', '#c9f1f1', 3135, 32.19),
  (255630, 'Hajime Umemiya', 'UMEMIY', 'https://s4.anilist.co/file/anilistcdn/character/large/b255630-lz7qcvEvmj3y.jpg', 1103, 'WIND BREAKER', '#288643', 2996, 30.1),
  (266969, 'Osaragi', 'OSARAG', 'https://s4.anilist.co/file/anilistcdn/character/large/b266969-AKjl1965ubol.png', 1681, 'SAKAMOTO DAYS', '#c9f1f1', 3230, 33.64),
  (268963, 'Michael Kaiser', 'KAISER', 'https://s4.anilist.co/file/anilistcdn/character/large/b268963-0i8SgRcs6ibf.png', 1342, 'BLUE LOCK Season 2', '#6ba128', 3099, 31.65),
  (282872, 'Yoru', 'YORU', 'https://s4.anilist.co/file/anilistcdn/character/large/b282872-taoHfD0JGiZG.jpg', 1679, 'Chainsaw Man', '#f1c90d', 3229, 33.63),
  (298929, 'Amo Empool', 'AMO', 'https://s4.anilist.co/file/anilistcdn/character/large/b298929-FPGX8O3DHcoL.png', 1382, 'Gachiakuta', '#e4a150', 3115, 31.9)
  ) v(id, name, sym, image, fav, show, color, p0, base) loop
    if exists (select 1 from characters where id = r.id) then continue; end if;
    s := r.sym; n := 2;
    while exists (select 1 from characters where sym = s) loop s := left(r.sym, 5) || n; n := n + 1; end loop;
    insert into characters (id, name, sym, image, favourites, media_title, color, p0, base, power, price, price_24h)
      values (r.id, r.name, s, r.image, r.fav, r.show, r.color, r.p0, r.base, r.p0, r.base, r.base);
    insert into news (char_id, up, source, text) values (r.id, true, 'trending', format('NEW LISTING: $%s (%s, %s) hits the market', s, r.name, r.show));
  end loop;
end $$;
select count(*) as listed from characters;
