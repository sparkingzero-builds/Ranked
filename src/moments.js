// The 32 hypest moments. Clips are straight scene uploads (no AMVs, TikTok edits or Shorts under a minute).
// Each has a few YouTube clips: the player uses the first one that plays
// (uploaders sometimes block embedding or delete videos), so backups keep the bracket working.
export const MOMENTS = [
  { id: 'gear5', title: 'Luffy awakens Gear 5', anime: 'One Piece', clips: ['Y--Mq6QbgIk'] },
  { id: 'zoro', title: 'Zoro: "Nothing happened"', anime: 'One Piece', clips: ['sAtZoIFW2Uw', 'XegbmW-qQSM'] },
  { id: 'ssj', title: "Goku's first Super Saiyan", anime: 'Dragon Ball Z', clips: ['c7jvWOfwc1M', '_qNmE0xQgfI'] },
  { id: 'cell', title: 'Gohan kills Cell (Father-Son Kamehameha)', anime: 'Dragon Ball Z', clips: ['xcz05iRlqtA'] },
  { id: 'vegeta', title: "Majin Vegeta's sacrifice", anime: 'Dragon Ball Z', clips: ['FQp3bE4ujKM', 'Jdcgx_aEEtQ'] },
  { id: 'ui', title: 'Goku masters Ultra Instinct vs Jiren', anime: 'Dragon Ball Super', clips: ['ri7i_utRzmQ', 'n-myqnVDL6c', 'DpX_HptzOVI'] },
  { id: 'pain', title: 'Naruto arrives in Sage Mode vs Pain', anime: 'Naruto Shippuden', clips: ['PXeSdf4lkvs', 'x2yepfJKRy0'] },
  { id: 'lee', title: 'Rock Lee opens the gates vs Gaara', anime: 'Naruto', clips: ['ia6DnOe0Sjg', 'Pq3FiJ31W-0', 'JvmaMEfhQuE'] },
  { id: 'guy', title: "Might Guy's Eighth Gate vs Madara", anime: 'Naruto Shippuden', clips: ['QxbOqeWn3jo', 'xIZwCBc1Ftc'] },
  { id: 'minato', title: 'Minato vs Obito', anime: 'Naruto Shippuden', clips: ['Llr2dcd-VBo', 'dXYMYSHXy-o', 'gKpn8P7xylU'] },
  { id: 'momoshiki', title: 'Boruto defeats Momoshiki', anime: 'Boruto', clips: ['RzClCJFpSoM', 'sTbM1i-3HS8'] },
  { id: 'getsuga', title: "Ichigo's Final Getsuga Tensho vs Aizen", anime: 'Bleach', clips: ['nAYw4ozbiS8', '3RNZGbqDFyU'] },
  { id: 'yhwach', title: "Ichigo's new Bankai vs Yhwach", anime: 'Bleach: Thousand-Year Blood War', clips: ['7RIb93r3cuM', 'A7ZZTRzKd9c', 'SWWjhUfR7PE'] },
  { id: 'gojo', title: "Gojo's Hollow Purple", anime: 'Jujutsu Kaisen', clips: ['7LzDcr20SHc', 'U2ja8ZLRwrA'] },
  { id: 'mahito', title: 'Yuji & Todo vs Mahito (Black Flash)', anime: 'Jujutsu Kaisen', clips: ['CbRVrLZKn0o'] },
  { id: 'mahoraga', title: 'Sukuna vs Mahoraga', anime: 'Jujutsu Kaisen', clips: ['_jZ6WDKgQvY', 'HQpipG1Pr5Y'] },
  { id: 'rui', title: "Tanjiro's Hinokami Kagura vs Rui", anime: 'Demon Slayer', clips: ['rUksF0HQSBE'] },
  { id: 'akaza', title: 'Tanjiro & Giyu vs Akaza', anime: 'Demon Slayer: Infinity Castle', clips: ['HFAzgHHITVM'] },
  { id: 'levi', title: 'Levi vs the Beast Titan', anime: 'Attack on Titan', clips: ['F0sqfPkCcyM', 'BDzzOX1NExM', 'RM-e-U0N2F0'] },
  { id: 'erwin', title: "Erwin's final speech and charge", anime: 'Attack on Titan', clips: ['9hh8qaajIXk', 'u-ZBLZATlhM', 'xWhQdt-FafY'] },
  { id: 'rumbling', title: 'Eren starts the Rumbling', anime: 'Attack on Titan', clips: ['vgezcnqfkdM'] },
  { id: 'smash', title: "All Might's United States of Smash", anime: 'My Hero Academia', clips: ['CDW2ReQZOQU'] },
  { id: 'boros', title: "Saitama's Serious Punch vs Boros", anime: 'One Punch Man', clips: ['5EOlj8IaoNM', 'ErXfj3sbIfU'] },
  { id: 'gon', title: "Gon's transformation vs Pitou", anime: 'Hunter x Hunter', clips: ['O3MYAarX_BI', 'Oc78yF8Wr58', 'XL2PiVNYD_Y'] },
  { id: 'netero', title: 'Netero vs Meruem', anime: 'Hunter x Hunter', clips: ['ptvxaXX2gik', 'Z3Ni0FTufi0'] },
  { id: 'mob', title: 'Mob hits 100%', anime: 'Mob Psycho 100', clips: ['2klGKa9ZBHY'] },
  { id: 'asta', title: 'Asta & Yami vs Dante', anime: 'Black Clover', clips: ['nJ744hVjmXE', '9Zg9_bfDrjI'] },
  { id: 'dio', title: 'Jotaro vs DIO: ZA WARUDO', anime: "JoJo's Bizarre Adventure", clips: ['FAwbIS45Tjw'] },
  { id: 'requiem', title: 'Giorno unleashes Gold Experience Requiem', anime: "JoJo's Bizarre Adventure", clips: ['WC_mHIBCHDo', 'yX_QC423VT0', 'Blr9yG1KihM'] },
  { id: 'jason', title: 'Kaneki vs Jason', anime: 'Tokyo Ghoul', clips: ['ZsQnAuh3tZU'] },
  { id: 'natsu', title: "Natsu's Dragon Force vs Jellal", anime: 'Fairy Tail', clips: ['SEzT7yTVKx0', 'AMjWSkCDM7A'] },
  { id: 'escanor', title: 'Escanor "The One" vs Estarossa', anime: 'Seven Deadly Sins', clips: ['uftfj8qBrrY', 'pDwT0ToUGnA'] },
]
export const MOMENT = Object.fromEntries(MOMENTS.map(m => [m.id, m]))
export const thumb = m => `https://i.ytimg.com/vi/${m.clips[0]}/hqdefault.jpg`
