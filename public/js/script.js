/* Author: Ian Pearce */

$(document).ready(function() {

  var egoUserId = $('#user-id').val();
  var earliestMsgTime, latestMsgTime;

  var SECONDS = 0
    , MINUTES = 1
    , HOURS = 2
    , DAYS = 3
    , MONTHS = 4
    , YEARS = 5;

  function toDate(epoch) {
    var date = new Date(0);
    date.setUTCSeconds(epoch / 1000);
    return date;
  }

  function formatTime(epoch) {
    var date = toDate(epoch);
    return strftime('%I:%M %p', date);
  }

  function formatDate(date, grain) {
    switch (grain) {
      case MINUTES: return strftime('%I:%M %p', date);
      case HOURS:   return strftime('%I:00 %p', date);
      case DAYS:    return strftime('%A, %B %d', date);
      case MONTHS:  return strftime('%A, %B %d', date);
      case YEARS:   return strftime('%A, %B %d, %Y', date);
      default:      return strftime('%A, %B %d', date);
    }
  }

  function dateDeltaUnit(thisDate, thatDate) {
    if (thisDate.getFullYear() != thatDate.getFullYear()) {
      return YEARS;
    } else if (thisDate.getMonth() != thatDate.getMonth()) {
      return MONTHS;
    } else if (thisDate.getDate() != thatDate.getDate()) {
      return DAYS;
    } else if (thisDate.getHours() != thatDate.getHours()) {
      return HOURS;
    } else if (thisDate.getMinutes() != thatDate.getMinutes()) {
      return MINUTES;
    } else {
      return SECONDS;
    }
  }

  function formatNotice(message) {
    return '<div class="clearfix notice">' + message + '</div>';
  }

  function formatMessage(id, userId, timestamp, name, message) {
    var egoClass = egoUserId == userId ? ' ego' : '';
    return '<div class="clearfix message' + egoClass + '" id="message-' + id + '">' +
           '  <div class="name">' + name + '</div>' +
           '  <div class="text">' + message + '</div>' +
           // '  <div class="date">' + formatTime(timestamp) + '</div>' +
           '  <div class="date">' + strftime('%m/%d %I:%M %p', toDate(timestamp)) + '</div>' +
           '</div>'
  }

  function prependChunk(chunk) { // most recent to least recent
    var thisMsgTime, dateMsg;
    for (var i=0; i<chunk.length; i++) {
      thisMsgTime = toDate(chunk[i].timestamp);
      if (earliestMsgTime) {
        dateDelta = dateDeltaUnit(earliestMsgTime, thisMsgTime);
        var now = new Date;
        if (earliestMsgTime.getDate() == now.getDate() && earliestMsgTime.getMonth() == now.getMonth() && earliestMsgTime.getFullYear() == now.getFullYear()) {
          // if the same day -> show hour updates
          if (dateDelta >= HOURS) prependNotice(formatDate(earliestMsgTime, dateDelta));
        } else {
          // more than a day ago -> show day updates
          if (dateDelta >= DAYS) prependNotice(formatDate(earliestMsgTime, dateDelta));
        }
      }
      $('#messages').prepend(formatMessage(chunk[i].id, chunk[i].user_id, chunk[i].timestamp, chunk[i].name, chunk[i].text));
      earliestMsgTime = thisMsgTime;
    }
  }

  function appendMessage(id, userId, timestamp, name, message) {
    $('#messages').append(formatMessage(id, userId, timestamp, name, message));
  }

  function prependNotice(message) {
    $('#messages').prepend(formatNotice(message));
  }

  function appendNotice(message) {
    $('#messages').append(formatNotice(message));
  }

  now.receiveMessage = function(id, userId, timestamp, name, message) {
    if (latestMsgTime) {
      var thisMsgTime = toDate(timestamp)
        , dateDelta = dateDeltaUnit(thisMsgTime, latestMsgTime);
      if (dateDelta >= HOURS) appendNotice(formatDate(thisMsgTime, dateDelta));
    }
    latestMsgTime = toDate(timestamp);
    appendMessage(id, userId, timestamp, name, message);
    $('body').prop('scrollTop', $('body').prop('scrollHeight'));
  };

  now.receiveHistory = function(chunk) {
    if (chunk.length < 10) {
      $('#get-history').hide();
    }
    prependChunk(chunk);
    if (chunk.length > 0 && !latestMsgTime) latestMsgTime = toDate(chunk[0].timestamp);
  };

  $('#send-button').click(function() {
    if ($('#text-input').val().replace(/^\s+|\s+$/g, '')) {
      now.distributeMessage($('#text-input').val());
      $('#text-input').val('');
    }
  });

  $('#text-input').keypress(function (e) {
    if (e.which && e.which === 13) {
      $('#send-button').click();
      return false;
    }
  });

  $('#get-history').click(function() {
    now.getHistory();
  });

  now.room = $('#id').val();

  $('#text-input').focus();

  $('body').prop('scrollTop', $('body').prop('scrollHeight'));
});
