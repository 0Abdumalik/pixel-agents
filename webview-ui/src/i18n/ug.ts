const ug: Record<string, string> = {
  // App - Loading
  'app.loading': 'يۈكلەنمەكتە...',

  // App - Edit action bar
  'edit.undo': 'يېنىۋېلىش',
  'edit.redo': 'قايتىلاش',
  'edit.save': 'ساقلاش',
  'edit.reset': 'ئەسلىگە قايتۇرۇش',
  'edit.resetConfirm': 'ئەسلىگە قايتۇرامسىز؟',
  'edit.yes': 'ھەئە',
  'edit.no': 'ياق',
  'edit.rotateHint': 'ئايلاندۇرۇش (R)',

  // App - Tooltips
  'tooltip.undo': 'يېنىۋېلىش (Ctrl+Z)',
  'tooltip.redo': 'قايتىلاش (Ctrl+Y)',
  'tooltip.save': 'ئورۇنلاشتۇرۇشنى ساقلاش',
  'tooltip.reset': 'ئالدىنقى ساقلانغان ئورۇنلاشتۇرۇشقا قايتۇرۇش',
  'tooltip.zoomIn': 'چوڭايتىش (Ctrl+غالتەك)',
  'tooltip.zoomOut': 'كىچىكلىتىش (Ctrl+غالتەك)',
  'tooltip.editLayout': 'ئىشخانا ئورۇنلاشتۇرۇشىنى تەھرىرلەش',
  'tooltip.settings': 'تەڭشەك',
  'tooltip.closeAgent': 'ۋاكالەتچىنى تاقاش',
  'tooltip.paintFloor': 'زېمىن سىزىش',
  'tooltip.paintWall': 'تام سىزىش (چېكىپ ئالماشتۇرۇش)',
  'tooltip.erase': 'ئۆچۈرۈش',
  'tooltip.placeFurniture': 'ئەھۋال قويۇش',
  'tooltip.adjustFloorColor': 'زېمىن رەڭگىنى تەڭشەش',
  'tooltip.pickFloor': 'مەۋجۇت زېمىندىن ئەندىزە ۋە رەڭ ئېلىش',
  'tooltip.adjustWallColor': 'تام رەڭگىنى تەڭشەش',
  'tooltip.pickFurniture': 'قويۇلغان ئەھۋالدىن تۈرنى ئېلىش',
  'tooltip.adjustFurnitureColor': 'تاللانغان ئەھۋال رەڭگىنى تەڭشەش',
  'tooltip.clearColor': 'رەڭنى ئۆچۈرۈش (ئەسلىگە قايتۇرۇش)',

  // Bottom toolbar
  'toolbar.addAgent': '+ ۋاكالەتچى',
  'toolbar.layout': 'ئورۇنلاشتۇرۇش',
  'toolbar.settings': 'تەڭشەك',

  // Settings modal
  'settings.title': 'تەڭشەك',
  'settings.openSessions': 'ئۈلگە ھۆججەتلىكىنى ئېچىش',
  'settings.exportLayout': 'ئورۇنلاشتۇرۇشنى چىقىرىش',
  'settings.importLayout': 'ئورۇنلاشتۇرۇشنى كىرگۈزۈش',
  'settings.soundNotifications': 'ئاۋاز ئۇقتۇرۇشى',
  'settings.alwaysShowLabels': 'بەلگىنى دائىم كۆرسىتىش',
  'settings.debugView': 'سازلاش كۆرۈنۈشى',

  // Editor toolbar
  'editor.floor': 'زېمىن',
  'editor.wall': 'تام',
  'editor.erase': 'ئۆچۈرۈش',
  'editor.furniture': 'ئەھۋال',
  'editor.color': 'رەڭ',
  'editor.pick': 'ئېلىش',
  'editor.clear': 'تازىلاش',
  'editor.colorize': 'رەڭلەش',

  // Tool overlay / Agent status
  'status.idle': 'بوش',
  'status.needsApproval': 'تەستىقلاش كېرەك',
  'status.subtask': 'تارماق ۋەزىپە',
  'status.waitingForInput': 'كىرگۈزۈشنى ساقلاۋاتقان بولۇشى مۇمكىن',

  // Debug view
  'debug.agent': 'ۋاكالەتچى',

  // Migration notice
  'migration.title': 'سىزدىن كەچۈرۈم سورايمىز!',
  'migration.body1': 'بىز ئوچۇق كودلۇق مەنبەلەرگە كۆچتۇق، ھەممىسى نۆلدىن قۇرۇلدى. بەختكە قارشى، بۇنىڭ بىلەن ئالدىنقى ئورۇنلاشتۇرۇشىڭىز ئەسلىگە قايتۇرۇلدى.',
  'migration.body2': 'بۇنىڭغا ھەقىقەتەن كەچۈرۈم سورايمىز.',
  'migration.body3': 'ياخشى خەۋەر شۇكى، بۇ پەقەت بىر قېتىملىق ئۆزگىرىش، كەلگۈسىدىكى قىزىقارلىق يېڭىلانمىلارغا يول ئاچتى.',
  'migration.body4': 'كۆڭۈل بۆلۈڭ، Pixel Agents نى ئىشلەتكەنلىكىڭىزگە رەھمەت!',
  'migration.gotIt': 'چۈشەندىم',

  // Language switcher
  'language.label': 'تىل',
  'language.en': 'English',
  'language.zh': '中文',
  'language.ug': 'ئۇيغۇرچە',
};

export default ug;
