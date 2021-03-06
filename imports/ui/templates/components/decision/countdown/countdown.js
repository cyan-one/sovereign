import { Template } from 'meteor/templating';
import { TAPi18n } from 'meteor/tap:i18n';
import { Session } from 'meteor/session';
import { ReactiveVar } from 'meteor/reactive-var';

import { blocktimes } from '/lib/const';
import { sync } from '/imports/ui/templates/layout/sync';
import { templetize, getImage } from '/imports/ui/templates/layout/templater';

import '/imports/ui/templates/components/decision/countdown/countdown.html';


/**
* @summary returns if effectively the poll is within a valid date
* @param {number} now current block
* @param {object} contract being analysed
* @return {boolean} true or fase
*/
const _isPollOpen = (now, contract) => {
  switch (contract.period) {
    case 'VOTING':
      break;
    default:
      return false;
  }
  if (contract && contract.rules.alwaysOn) {
    return true;
  }
  if (contract && contract.closing) {
    return (now < contract.closing.height);
  }
  return true;
};

/**
* @summary percentage of time already transcurred for this decision
* @param {number} currentBlock now
* @param {number} delta length
* @param {number} finalBlock end

* @return {number} percentage in float
*/
const _getPercentage = (currentBlock, delta, finalBlock) => {
  if (finalBlock <= currentBlock) {
    return 0;
  }
  const initialBlock = parseInt(finalBlock - delta, 10);
  const confirmedBlocks = parseInt(currentBlock - initialBlock, 10);
  const percentage = parseFloat((confirmedBlocks * 100) / delta);

  return parseFloat(100 - percentage, 10);
};

/**
* @summary percentage of time already transcurred for this decision
* @param {number} remainingBlocks until dedadline
* @param {number} height final block
* @param {boolean} alwaysOn if on always
* @param {boolean} editorMode if editor
* @return {string} with countdown sentence
*/
const _getDeadline = (now, remainingBlocks, length, height, alwaysOn, editorMode, periodDuration, period) => {
  let countdown = TAPi18n.__('countdown-expiration');
  let count = remainingBlocks;

  switch (period) {
    case 'QUEUE':
    case 'GRACE':
    case 'PROCESS':
      countdown = TAPi18n.__(`countdown-${period.toLowerCase()}`);
      break;
    default:
      if (editorMode) {
        if (!alwaysOn) {
          countdown = TAPi18n.__('poll-hypothetical');
        } else {
          countdown = TAPi18n.__('poll-never-ends');
        }
      } else if (alwaysOn) {
        countdown = TAPi18n.__('poll-never-ends');
      } else if (height <= now) {
        countdown = TAPi18n.__('poll-closed-after-time');
        count = length;
      }
  }

  // get total seconds between the times
  let delta;
  if (!periodDuration) {
    delta = parseInt(count * blocktimes.ETHEREUM_SECONDS_PER_BLOCK, 10);
  } else {
    delta = parseInt(count * (periodDuration / 1000), 10);
  }

  // calculate (and subtract) whole days
  const days = Math.floor(delta / 86400);
  delta -= days * 86400;

  // calculate (and subtract) whole hours
  const hours = Math.floor(delta / 3600) % 24;
  delta -= hours * 3600;

  // calculate (and subtract) whole minutes
  const minutes = Math.floor(delta / 60) % 60;
  delta -= minutes * 60;

  // what's left is seconds
  const seconds = delta % 60;


  if (days > 0) {
    countdown = countdown.replace('{{days}}', `${days} ${days > 1 ? TAPi18n.__('days-compressed') : TAPi18n.__('days-singular')}`);
  } else {
    countdown = countdown.replace('{{days}}', '');
  }
  if (hours > 0) {
    countdown = countdown.replace('{{hours}}', `${hours} ${hours > 1 ? TAPi18n.__('hours-compressed') : TAPi18n.__('hours-singular')}`);
  } else {
    countdown = countdown.replace('{{hours}}', '');
  }
  if (minutes > 0) {
    countdown = countdown.replace('{{minutes}}', `${minutes} ${minutes > 1 ? TAPi18n.__('minutes-compressed') : TAPi18n.__('minutes-singular')}`);
  } else {
    countdown = countdown.replace('{{minutes}}', '');
  }
  if (seconds > 0) {
    countdown = countdown.replace('{{seconds}}', `${seconds} ${seconds > 1 ? TAPi18n.__('seconds-compressed') : TAPi18n.__('seconds-singular')}`);
  } else {
    countdown = countdown.replace('{{seconds}}', '');
  }

  if (height) {
    countdown = countdown.replace('{{height}}', `${height.toLocaleString(undefined, [{ style: 'decimal' }])}`);
  }

  countdown = countdown.replace('{{blocks}}', `${remainingBlocks.toLocaleString(undefined, [{ style: 'decimal' }])} ${remainingBlocks > 1 ? TAPi18n.__('periods-compressed') : TAPi18n.__('periods-singular')}`);

  return `${countdown}`;
};


/**
* @summary determines deadline status based on current blockheight
* @param {object} instance where to write last block number
*/
const _currentBlock = async (instance) => {
  let now;
  if (!Session.get('blockTimes')) {
    await sync();
  }
  const blockTimes = Session.get('blockTimes');
  if (blockTimes && blockTimes.length > 0) {
    now = _.pluck(_.where(blockTimes, { collectiveId: instance.data.collectiveId }), 'height');
    instance.now.set(now);
  }
  return now;
};

Template.countdown.onCreated(function () {
  Template.instance().now = new ReactiveVar();
  _currentBlock(Template.instance());

  Template.instance().imageTemplate = new ReactiveVar();
  templetize(Template.instance());
});

/**
* @summary calculates remaining time based on chain rules
* @param {number} now current time in blockchain clock
* @param {object} data the information for this poll
*/
const _getRemaining = (now, data) => {
  let confirmed;
  let delta;
  let closing;
  switch (data.period) {
    case 'QUEUE':
      confirmed = parseInt(data.delta - 1, 10);
      break;
    case 'GRACE':
      delta = parseInt(((data.graceCalendar.getTime() - data.timestamp.getTime()) / (data.periodDuration)) - data.delta, 10);
      closing = parseInt(data.height + delta, 10);
      confirmed = parseInt(delta - (closing - now), 10);
      break;
    default:
      confirmed = parseInt(data.delta - (data.height - now), 10);
  }
  return parseInt(data.delta - confirmed, 10);
};

Template.countdown.helpers({
  label() {
    const now = Template.instance().now.get();
    const remaining = _getRemaining(now, this);
    if (isNaN(remaining)) {
      return TAPi18n.__('syncing');
    }
    const deadline = _getDeadline(now, remaining, this.delta, this.height, this.alwaysOn, this.editorMode, this.periodDuration, this.period);
    return deadline;
  },
  period() {
    return this.period ? TAPi18n.__(`moloch-period-${this.period.toLowerCase()}`) : '';
  },
  periodStyle() {
    return this.period ? `period-${this.period.toLowerCase()}` : '';
  },
  timerStyle() {
    const now = Template.instance().now.get();
    const remaining = _getRemaining(now, this);
    let closing = this.height;
    let delta = this.delta;
    switch (this.period) {
      case 'QUEUE':
        closing = parseInt((this.height - this.delta) + 1, 10);
        delta = 1;
        break;
      case 'GRACE':
        delta = parseInt(((this.graceCalendar.getTime() - this.timestamp.getTime()) / (this.periodDuration)) - this.delta, 10);
        closing = parseInt(this.height + delta, 10);
        break;
      case 'PROCESS':
        delta = 0;
        closing = now;
        break;
      default:
        closing = this.height;
    }
    if (!isNaN(remaining)) {
      return `width: ${_getPercentage(now, delta, closing)}%`;
    }
    return 'width: 0%;';
  },
  alertMode() {
    const now = Template.instance().now.get();
    let closing = this.height;
    let delta = this.delta;
    switch (this.period) {
      case 'QUEUE':
        closing = parseInt((this.height - this.delta) + 1, 10);
        delta = 1;
        break;
      default:
        closing = this.height;
    }
    const percentage = _getPercentage(now, delta, closing);

    let style = '';
    switch (this.period) {
      case 'QUEUE':
      case 'GRACE':
      case 'PROCESS':
        style = `countdown-timer-${this.period.toLowerCase()}`;
        break;
      default:
        if (percentage && percentage < 25) {
          style = 'countdown-timer-final';
        } else if (this.period === 'VOTING') {
          style = `countdown-timer-${this.period.toLowerCase()}`;
        }
    }
    return style;
  },
  getImage(pic) {
    return getImage(Template.instance().imageTemplate.get(), pic);
  },
});

export const currentBlock = _currentBlock;
export const isPollOpen = _isPollOpen;
