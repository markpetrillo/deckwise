// Run in a dedicated agent-browser session against localhost, never a personal browser.
(async () => {
  if (!["localhost", "127.0.0.1"].includes(location.hostname))
    throw Error("Smoke test requires localhost");
  const assert = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const click = (selector) => {
    const button = document.querySelector(selector);
    assert(button, `Missing ${selector}`);
    button.click();
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const results = [];
  const raw = () => JSON.parse(localStorage.getItem("deckwise.v1"));
  if (document.querySelector('[data-action="finish"]'))
    click('[data-action="finish"]');
  document.querySelector("dialog")?.close();
  click('[data-action="home"]');
  click('[data-mode="card-number"]');
  click('[data-action="start"]');
  const expected =
    "4C 2H 7D 3C 4H 6D AS 5H 9S 2S QH 3D QC 8H 6S 5S 9H KC 2D JH 3S 8S 6H TC 5D KD 2C 3H 8D 5C KS JD 8C TS KH JC 7S TH AD 4S 7H 4D AC 9C JS QD 7C QS TD 6C AH 9D".split(
      " ",
    );
  const ranks = {
      A: "Ace",
      T: "Ten",
      J: "Jack",
      Q: "Queen",
      K: "King",
      2: "Two",
      3: "Three",
      4: "Four",
      5: "Five",
      6: "Six",
      7: "Seven",
      8: "Eight",
      9: "Nine",
    },
    suits = { C: "Clubs", D: "Diamonds", H: "Hearts", S: "Spades" };
  const correctNumber = () =>
    expected.findIndex(
      (c) =>
        `${ranks[c[0]]} of ${suits[c[1]]}` ===
        document.querySelector(".prompt-card img").alt,
    ) + 1;
  let correct = correctNumber();
  const buttons = [...document.querySelectorAll("[data-answer]")];
  const options = buttons.map((b) => Number(b.dataset.answer));
  assert(
    buttons.length === 5 &&
      new Set(options).size === 5 &&
      options.includes(correct),
    "Five unique choices",
  );
  assert(
    options.every((x, i) => !i || x > options[i - 1]),
    "Ascending numeric order",
  );
  assert(
    buttons.every(
      (b) =>
        b.getBoundingClientRect().width >= 44 &&
        b.getBoundingClientRect().height >= 44,
    ),
    "Minimum touch target",
  );
  buttons.find((b) => Number(b.dataset.answer) !== correct).click();
  assert(
    raw().attempts.at(-1).firstCorrect === false,
    "Wrong answer persisted immediately",
  );
  click(`[data-answer="${correct}"]`);
  assert(
    raw().attempts.at(-1).firstCorrect === false,
    "Correction preserves failure",
  );
  results.push("wrong → correct persistence");
  click('[data-action="next"]');
  correct = correctNumber();
  click('[data-action="hint"]');
  click(`[data-answer="${correct}"]`);
  assert(raw().attempts.at(-1).hint === true, "Hint recorded");
  results.push("assisted answer tracking");
  click('[data-action="next"]');
  click('[data-action="reveal"]');
  assert(raw().attempts.at(-1).revealed === true, "Reveal recorded");
  results.push("reveal tracking");
  click('[data-action="next"]');
  correct = correctNumber();
  click('[data-action="pause"]');
  assert(
    document.querySelector("[data-answer]").disabled,
    "Paused answers disabled",
  );
  click('[data-action="pause"]');
  click(`[data-answer="${correct}"]`);
  assert(
    raw().attempts.at(-1).elapsedMs === null &&
      raw().attempts.at(-1).interrupted,
    "Interrupted timing excluded",
  );
  results.push("pause timing");
  click('[data-action="finish"]');
  assert(document.querySelector("dialog[open]"), "Session summary");
  click('[data-action="summary-progress"]');
  assert(
    document.querySelectorAll(".deck-table tbody tr").length === 52,
    "52-card report",
  );
  results.push("session and per-card reporting");
  click('[data-action="home"]');
  click('[data-mode="number-card"]');
  click('[data-action="start"]');
  const position = Number(
    document
      .querySelector(".prompt-card .number-card")
      .getAttribute("aria-label").replace("Position ", ""),
  );
  const cardOptions = [...document.querySelectorAll("[data-answer]")].map(
    (b) => expected[Number(b.dataset.answer) - 1],
  );
  const sortValue = (c) =>
    "A23456789TJQK".indexOf(c[0]) * 4 + "CDHS".indexOf(c[1]);
  assert(
    cardOptions.length === 5 &&
      cardOptions.every(
        (c, i) => !i || sortValue(c) > sortValue(cardOptions[i - 1]),
      ),
    "Card options sorted rank then suit",
  );
  await sleep(300);
  click(`[data-answer="${position}"]`);
  assert(
    raw().attempts.at(-1).direction === "number-card",
    "Reverse direction recorded",
  );
  results.push("reverse drill and card order");
  click('[data-action="finish"]');
  document.querySelector("dialog").close();
  click('[data-view="deck"]');
  assert(
    document.querySelectorAll(".gallery-slide").length === 52,
    "Full gallery",
  );
  const slider = document.querySelector("#jump");
  slider.value = "52";
  slider.dispatchEvent(new Event("input"));
  await sleep(700);
  assert(
    document.querySelector("#deck-position").textContent === "52 of 52",
    "Gallery jump",
  );
  results.push("gallery navigation");
  click('[data-view="progress"]');
  assert(
    document.documentElement.scrollWidth <= innerWidth,
    "No horizontal page overflow",
  );
  assert(raw().attempts.length >= 5, "Attempts saved");
  click('[data-action="home"]');
  click('[data-action="start"]');
  click('[data-action="pause"]');
  const pausedTime = document.querySelector('#remaining').textContent;
  const beforeEnd = raw();
  await sleep(1400);
  assert(document.querySelector('#remaining').textContent === pausedTime, 'Pause freezes timer');
  click('[data-action="finish"]');
  assert(raw().attempts.length === beforeEnd.attempts.length, 'Early end does not grade unanswered prompt');
  assert(JSON.stringify(raw().memory) === JSON.stringify(beforeEnd.memory), 'Early end preserves learning state');
  document.querySelector('dialog').close();
  results.push('frozen pause and unanswered early finish');
  return JSON.stringify({
    passed: results,
    attempts: raw().attempts.length,
    viewport: [innerWidth, innerHeight],
  });
})();
