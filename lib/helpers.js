var util = {
  isBlank: function(str) {
    return (!str || /^\s*$/.test(str));
  },
  replaceAll: function(text, search, replacement) {
    return text.replace(new RegExp(search, 'g'), replacement);
  }
};

module.exports = util;
