// Hype moments, grouped by franchise so players can pick only anime they've seen.
// Official uploads come first (Crunchyroll, then VIZ / Netflix / Pokémon / Prime Video); unofficial ones are backups.
// Clips are straight scene uploads (no AMVs, TikTok edits, music swaps or Shorts), 1 to 4 minutes long.
// Each has a few YouTube clips: the player uses the first one that plays
// (uploaders sometimes block embedding or delete videos), so backups keep the bracket working.
const F = {
  db: 'Dragon Ball', naruto: 'Naruto', op: 'One Piece', mha: 'My Hero Academia', bc: 'Black Clover',
  aot: 'Attack on Titan', jojo: "JoJo's Bizarre Adventure", bleach: 'Bleach', dn: 'Death Note', pk: 'Pokémon',
  baki: 'Baki', sds: 'Seven Deadly Sins', jjk: 'Jujutsu Kaisen', ff: 'Fire Force', ds: 'Demon Slayer',
  opm: 'One Punch Man', hxh: 'Hunter x Hunter', mob: 'Mob Psycho 100', tg: 'Tokyo Ghoul', ft: 'Fairy Tail',
}

export const MOMENTS = [
  // Dragon Ball
  { id: 'ssj', f: F.db, title: "Goku's first Super Saiyan", anime: 'Dragon Ball Z', clips: ['c7jvWOfwc1M', '_qNmE0xQgfI'] },
  { id: 'cell', f: F.db, title: 'Gohan kills Cell (Father-Son Kamehameha)', anime: 'Dragon Ball Z', clips: ['xcz05iRlqtA'] },
  { id: 'vegeta', f: F.db, title: "Majin Vegeta's sacrifice", anime: 'Dragon Ball Z', clips: ['Jdcgx_aEEtQ'] },
  { id: 'ui', f: F.db, title: 'Goku masters Ultra Instinct vs Jiren', anime: 'Dragon Ball Super', clips: ['6CF29TtxU2c', 'ri7i_utRzmQ'] },
  { id: 'ssj4', f: F.db, title: 'Goku goes Super Saiyan 4 for the first time', anime: 'Dragon Ball GT', clips: ['4CIvw-HEvT0'] },
  { id: 'galick', f: F.db, title: 'Kamehameha vs Galick Gun', anime: 'Dragon Ball Z', clips: ['Eo1SzVoa4AU', 'JNhlsJ1yrBE'] },
  { id: 'beast', f: F.db, title: 'Gohan goes Beast vs Cell Max', anime: 'Dragon Ball Super: Super Hero', clips: ['Z8lP_6Iq9F8', '6js5QYX2vr0'] },
  // Naruto
  { id: 'pain', f: F.naruto, title: 'Naruto arrives in Sage Mode vs Pain', anime: 'Naruto Shippuden', clips: ['PXeSdf4lkvs', 'x2yepfJKRy0'] },
  { id: 'lee', f: F.naruto, title: 'Rock Lee opens the gates vs Gaara', anime: 'Naruto', clips: ['pi6ICtn9S4U', 'ia6DnOe0Sjg'] },
  { id: 'guy', f: F.naruto, title: "Might Guy's Night Guy vs Madara", anime: 'Naruto Shippuden', clips: ['98yvX9wY7J0', 'fp7VyLWbF1I'] },
  { id: 'minato', f: F.naruto, title: 'Minato vs Obito', anime: 'Naruto Shippuden', clips: ['Llr2dcd-VBo'] },
  { id: 'momoshiki', f: F.naruto, title: 'Boruto defeats Momoshiki', anime: 'Boruto', clips: ['RzClCJFpSoM', 'sTbM1i-3HS8'] },
  { id: 'valley', f: F.naruto, title: 'Naruto vs Sasuke: the final Rasengan vs Chidori', anime: 'Naruto Shippuden', clips: ['qi2rByJed-E', 'VzU3HoI8A0c'] },
  { id: 'itachi', f: F.naruto, title: "Itachi's Susanoo vs Sasuke", anime: 'Naruto Shippuden', clips: ['X6m6JIQ8Lc0'] },
  // One Piece
  { id: 'gear5', f: F.op, title: 'Luffy awakens Gear 5', anime: 'One Piece', clips: ['Y--Mq6QbgIk'] },
  { id: 'zoro', f: F.op, title: 'Zoro: "Nothing happened"', anime: 'One Piece', clips: ['sAtZoIFW2Uw', 'XegbmW-qQSM'] },
  { id: 'celestial', f: F.op, title: 'Luffy punches a Celestial Dragon', anime: 'One Piece', clips: ['IX2EfnTc_Eg', 'MEHqt5250N0'] },
  { id: 'whitebeard', f: F.op, title: 'Whitebeard arrives at Marineford', anime: 'One Piece', clips: ['Su5xUGYSa_k', 'G9d-CgcTWtk'] },
  { id: 'robin', f: F.op, title: 'Robin: "I want to live!"', anime: 'One Piece', clips: ['npufTv1ifNg', 'qiyLr1SbVqw'] },
  // My Hero Academia
  { id: 'smash', f: F.mha, title: "All Might's United States of Smash", anime: 'My Hero Academia', clips: ['CDW2ReQZOQU'] },
  { id: 'muscular', f: F.mha, title: 'Deku 1,000,000% vs Muscular', anime: 'My Hero Academia', clips: ['ct8In_FAvZE', '9PNFmvoA6z4'] },
  { id: 'endeavor', f: F.mha, title: "Endeavor's Plus Ultra Prominence Burn", anime: 'My Hero Academia', clips: ['wlE7KOUXYQY', 'cz_3JSR3MNM'] },
  { id: 'overhaul', f: F.mha, title: 'Deku 100% vs Overhaul', anime: 'My Hero Academia', clips: ['hm-zgEdCRes', 'cgeRb19cfi4'] },
  // Black Clover
  { id: 'asta', f: F.bc, title: 'Asta & Yami vs Dante', anime: 'Black Clover', clips: ['nJ744hVjmXE', '9Zg9_bfDrjI'] },
  { id: 'licht', f: F.bc, title: 'Asta surpasses his limits vs Licht', anime: 'Black Clover', clips: ['Y-wube3m2NE', 'Cwk0bXiVRao'] },
  { id: 'yami', f: F.bc, title: "Yami's Dark Cloaked Dimension Slash", anime: 'Black Clover', clips: ['KXiSdblIUzs', 'vrzCvc_klPw'] },
  { id: 'liebe', f: F.bc, title: 'Asta vs Liebe', anime: 'Black Clover', clips: ['QXOvFJo4jVY', 'vf4AvouYtzw'] },
  // Attack on Titan
  { id: 'levi', f: F.aot, title: 'Levi vs the Beast Titan', anime: 'Attack on Titan', clips: ['rhjl6UOhcP0', 'F0sqfPkCcyM', 'RM-e-U0N2F0'] },
  { id: 'erwin', f: F.aot, title: "Erwin's final speech and charge", anime: 'Attack on Titan', clips: ['9hh8qaajIXk', 'u-ZBLZATlhM', 'xWhQdt-FafY'] },
  { id: 'rumbling', f: F.aot, title: 'Eren starts the Rumbling', anime: 'Attack on Titan', clips: ['KQcWQ46K6HE', 'fdSw6XEcg8I', 'zlB9F7PoX0E'] },
  { id: 'reiner', f: F.aot, title: 'Reiner & Bertholdt reveal themselves', anime: 'Attack on Titan', clips: ['YWzB08wmSYU', 'urvq-f1xvZI'] },
  { id: 'erenfirst', f: F.aot, title: "Eren's first Titan transformation", anime: 'Attack on Titan', clips: ['Uy41ee3ypy8', 'YeTJ3zSsSfg'] },
  // JoJo
  { id: 'dio', f: F.jojo, title: 'Jotaro vs DIO: ZA WARUDO', anime: "JoJo's Bizarre Adventure", clips: ['IB0EXAeJWms', 'i-L0Gs2whvc'] },
  { id: 'requiem', f: F.jojo, title: 'Giorno unleashes Gold Experience Requiem', anime: "JoJo's Bizarre Adventure", clips: ['WC_mHIBCHDo'] },
  { id: 'nextline', f: F.jojo, title: 'Joseph: "Your next line is…"', anime: "JoJo's Bizarre Adventure", clips: ['9jnVadPvjro', 'ScK3p90IZlM'] },
  { id: 'btd', f: F.jojo, title: 'Kira activates Bites the Dust', anime: "JoJo's Bizarre Adventure", clips: ['mlqHDK7tTpI', 'VfjJQka7cfc'] },
  // Bleach
  { id: 'getsuga', f: F.bleach, title: "Ichigo's Final Getsuga Tensho vs Aizen", anime: 'Bleach', clips: ['rhRdazXjEDw', 'MihB_ewbtoY', 'aJMZ4hZOZDs'] },
  { id: 'yhwach', f: F.bleach, title: "Ichigo's new Bankai vs Yhwach", anime: 'Bleach: Thousand-Year Blood War', clips: ['bNgur2EuJxc', 'F6fgIICsYOM', 'SWWjhUfR7PE'] },
  { id: 'bankai', f: F.bleach, title: "Ichigo's first Bankai vs Byakuya", anime: 'Bleach', clips: ['IS6WAGKGz4Q'] },
  { id: 'unohana', f: F.bleach, title: 'Kenpachi vs Unohana', anime: 'Bleach: Thousand-Year Blood War', clips: ['Onmiy1zG2CY', 'Z9TwAlXaWA8'] },
  { id: 'ulquiorra', f: F.bleach, title: 'Hollow Ichigo vs Ulquiorra', anime: 'Bleach', clips: ['4XCKamWlCEo', 'APUuNvKUaPQ'] },
  // Death Note
  { id: 'chip', f: F.dn, title: 'Light: "I\'ll take a potato chip… and eat it!"', anime: 'Death Note', clips: ['perPAMpnvKk', 'pn3gPzRU5FY'] },
  { id: 'iaml', f: F.dn, title: 'L: "I am L"', anime: 'Death Note', clips: ['OZbtyy_UF24', 'NlQcrBSByZE'] },
  { id: 'kira', f: F.dn, title: "Light's final speech: \"I am Kira\"", anime: 'Death Note', clips: ['rJMTFP1aDWU', 'Qw60EprX1Tw'] },
  { id: 'ldeath', f: F.dn, title: "L's death", anime: 'Death Note', clips: ['AsPe1Z6E-Oc', 'qkwOiDc1lo4'] },
  // Pokémon
  { id: 'champion', f: F.pk, title: 'Ash becomes World Champion', anime: 'Pokémon Journeys', clips: ['mSI_P9UG98w'] },
  { id: 'greninja', f: F.pk, title: 'The power of Ash-Greninja', anime: 'Pokémon XYZ', clips: ['a-LgVJ77Gic', 'QvTbWeQEy1U'] },
  { id: 'charizard', f: F.pk, title: "Ash's Charizard returns", anime: 'Pokémon', clips: ['hKmfKCuVUEw', 'l9LI0MVWPAE'] },
  // Baki
  { id: 'fatherson', f: F.baki, title: 'Yujiro vs Baki: father vs son', anime: 'Baki Hanma', clips: ['oFMO16M9-A4', '0u08WBlTl2g'] },
  { id: 'pickle', f: F.baki, title: 'Baki vs Pickle', anime: 'Baki Hanma', clips: ['9sMNp6Vu2lg', 'ti00JeUCVCs'] },
  { id: 'demonback', f: F.baki, title: "Yujiro's Demon Back", anime: 'Baki Hanma', clips: ['Bw5ip70R8xQ', '_NamO4E9H9c'] },
  // Seven Deadly Sins
  { id: 'escanor', f: F.sds, title: 'Escanor "The One" vs Estarossa', anime: 'Seven Deadly Sins', clips: ['uftfj8qBrrY', 'pDwT0ToUGnA'] },
  { id: 'demonmel', f: F.sds, title: 'Meliodas unleashes his demon power', anime: 'Seven Deadly Sins', clips: ['lxXCJfW9giA', '7bS3SuAD5GU'] },
  { id: 'counter', f: F.sds, title: "Meliodas' Full Counter", anime: 'Seven Deadly Sins', clips: ['KqkUuUTsej0', '5wgbicYyQL8'] },
  // Jujutsu Kaisen
  { id: 'gojo', f: F.jjk, title: "Gojo's Hollow Purple", anime: 'Jujutsu Kaisen', clips: ['7LzDcr20SHc', 'U2ja8ZLRwrA'] },
  { id: 'mahito', f: F.jjk, title: 'Yuji & Todo vs Mahito (Black Flash)', anime: 'Jujutsu Kaisen', clips: ['CbRVrLZKn0o'] },
  { id: 'mahoraga', f: F.jjk, title: 'Sukuna vs Mahoraga', anime: 'Jujutsu Kaisen', clips: ['vNjly9MkiTU', '6vRJ24Klpto'] },
  { id: 'toji', f: F.jjk, title: 'Gojo vs Toji', anime: 'Jujutsu Kaisen', clips: ['Egju6xs6Fro', 'yQlL70K_Aq8'] },
  { id: 'choso', f: F.jjk, title: 'Yuji vs Choso', anime: 'Jujutsu Kaisen', clips: ['JyozJdyDkjQ', 'nGbGkoDbhdI'] },
  // Fire Force
  { id: 'adolla', f: F.ff, title: "Shinra's 100% Adolla Burst to save Sho", anime: 'Fire Force', clips: ['PcYVAS_oHzM', 'JYgj5ZTbT4I'] },
  { id: 'benimaru', f: F.ff, title: "Benimaru's Nichirin Akatsuki", anime: 'Fire Force', clips: ['ThozbbykMdY', 'v4ak3J8DTSU'] },
  { id: 'arthur', f: F.ff, title: 'Arthur vs Dragon', anime: 'Fire Force', clips: ['I4qjbYob8tc', 'KSji9rUpOz4'] },
  // the rest of the original bracket
  { id: 'rui', f: F.ds, title: "Tanjiro's Hinokami Kagura vs Rui", anime: 'Demon Slayer', clips: ['R6v9bfsWgXw', 'qH4Om8HNB4c'] },
  { id: 'akaza', f: F.ds, title: 'Tanjiro & Giyu vs Akaza', anime: 'Demon Slayer: Infinity Castle', clips: ['HFAzgHHITVM'] },
  { id: 'boros', f: F.opm, title: "Saitama's Serious Punch vs Boros", anime: 'One Punch Man', clips: ['5EOlj8IaoNM'] },
  { id: 'gon', f: F.hxh, title: "Gon's transformation vs Pitou", anime: 'Hunter x Hunter', clips: ['prWR7FXMUDM', 'O3MYAarX_BI'] },
  { id: 'netero', f: F.hxh, title: 'Netero vs Meruem', anime: 'Hunter x Hunter', clips: ['IDCm4ZDdcBc', 'Z3Ni0FTufi0'] },
  { id: 'mob', f: F.mob, title: 'Mob hits 100%', anime: 'Mob Psycho 100', clips: ['aT_P7R2ebsQ', '2klGKa9ZBHY'] },
  { id: 'jason', f: F.tg, title: 'Kaneki vs Jason', anime: 'Tokyo Ghoul', clips: ['ZsQnAuh3tZU'] },
  { id: 'natsu', f: F.ft, title: "Natsu's Dragon Force vs Jellal", anime: 'Fairy Tail', clips: ['GB90ct9o9ko', 'no2oaYYbg8I'] },
]
export const MOMENT = Object.fromEntries(MOMENTS.map(m => [m.id, m]))
export const FRANCHISES = [...new Set(MOMENTS.map(m => m.f))]
export const thumb = m => `https://i.ytimg.com/vi/${m.clips[0]}/hqdefault.jpg`
