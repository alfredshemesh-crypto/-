"use strict";

const $ = id => document.getElementById(id);
const eventFields = [
  ["number", "מספר אירוע"], ["date", "תאריך האירוע", "date"], ["time", "שעת האירוע", "time"],
  ["location", "מיקום האירוע"], ["event_department", "מחלקה משויכת לאירוע", "text", "department"],
  ["type", "סוג האירוע", "text", "type"], ["description", "מהות האירוע", "long"],
  ["direct", "גורם ישיר מדווח", "long"], ["root", "גורם שורש שנקבע בתחקיר", "long"],
  ["witnesses", "עדים לאירוע"], ["status", "מצב התחקיר"], ["action", "פעולה מתקנת", "long"],
  ["source", "מקור הדיווח"], ["missing", "פרטים להשלמה", "long"],
];
const personFields = [
  ["name", "שם הנפגע או קוד עובד"], ["department", "מחלקת העובד", "text", "department"],
  ["role", "תפקיד הנפגע"], ["body", "איבר שנפגע", "text", "body"],
  ["injury", "סוג הפגיעה"], ["mechanism", "מנגנון הפגיעה"], ["treatment", "טיפול שניתן"],
  ["severity", "חומרת פגיעה"], ["days", "ימי היעדרות עקב האירוע", "number"],
];
const filters = ["department", "type", "body"];
const unknown = "לא תועד";
const nf = new Intl.NumberFormat("he-IL");
const dateFormat = new Intl.DateTimeFormat("he-IL", {timeZone: "UTC"});
let records = [];
let activeId = null;
let importData = null;
let previewUrl = null;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function status(id, message = "", error = false) {
  const node = $(id);
  node.textContent = message;
  node.dataset.error = String(error);
  node.hidden = !message;
}

async function api(path, payload) {
  const response = await fetch("/api/" + path, payload === undefined ? undefined : {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "הפעולה נכשלה");
  return data;
}

function encodeFile(file) {
  if (file.size > 24 * 1024 * 1024) throw new Error("בחר קובץ בגודל של עד 24MB");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("לא ניתן לקרוא את הקובץ"));
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  });
}

function go(screen) {
  for (const name of ["dashboard", "entry"]) $(name).hidden = name !== screen;
  for (const button of document.querySelectorAll("nav [data-screen]")) {
    if (button.dataset.screen === screen) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  status("notice");
  window.scrollTo(0, 0);
}

function departments(event, people = event.people) {
  const names = people.map(person => person.department || event.event_department || unknown);
  return [...new Set(names.length ? names : [event.event_department || unknown])];
}

function valuesFor(key) {
  if (key === "department") return records.flatMap(event => departments(event));
  if (key === "type") return records.map(event => event.type || unknown);
  return records.flatMap(event => event.people.map(person => person.body || unknown));
}

function updateChoices() {
  for (const key of filters) {
    const select = $(key + "-filter");
    const previous = select.value;
    const values = [...new Set(valuesFor(key))].sort((a, b) => a.localeCompare(b, "he"));
    select.replaceChildren(new Option("הכול", ""), ...values.map(value => new Option(value, value)));
    if (values.includes(previous)) select.value = previous;
    let list = $("choices-" + key);
    if (!list) {
      list = element("datalist");
      list.id = "choices-" + key;
      document.body.append(list);
    }
    list.replaceChildren(...values.filter(value => value !== unknown).map(value => new Option(value, value)));
  }
}

function chart(id, labels) {
  const counts = new Map();
  for (const label of labels) counts.set(label, (counts.get(label) || 0) + 1);
  const rows = [...counts].sort(([a, x], [b, y]) => y - x || a.localeCompare(b, "he"));
  const max = rows[0]?.[1] || 1;
  $(id).replaceChildren(...(rows.length ? rows.map(([label, count]) => {
    const row = element("div", undefined, "bar");
    const track = element("div", undefined, "track");
    const fill = element("span");
    fill.style.width = (count * 100 / max) + "%";
    track.setAttribute("aria-hidden", "true");
    track.append(fill);
    row.append(element("span", label), element("b", nf.format(count)), track);
    return row;
  }) : [element("small", "אין נתונים להצגה")]));
}

function draw() {
  const department = $("department-filter").value;
  const type = $("type-filter").value;
  const body = $("body-filter").value;
  const visible = [];
  for (const event of records) {
    if (type && (event.type || unknown) !== type) continue;
    const people = event.people.filter(person =>
      (!department || (person.department || event.event_department || unknown) === department) &&
      (!body || (person.body || unknown) === body)
    );
    if ((department || body) && event.people.length && !people.length) continue;
    if (!event.people.length && (body || (department && !departments(event).includes(department)))) continue;
    visible.push({event, people});
  }

  const people = visible.flatMap(row => row.people);
  const recorded = people.filter(person => person.days !== "");
  $("events-count").textContent = nf.format(visible.length);
  $("people-count").textContent = nf.format(people.length);
  $("days-count").textContent = recorded.length ? nf.format(recorded.reduce((sum, p) => sum + Number(p.days), 0)) : "—";
  $("days-note").textContent = people.length ? nf.format(recorded.length) + " מתוך " + nf.format(people.length) + " נפגעים עם נתון" : "";
  $("no-injury-count").textContent = nf.format(visible.filter(({event}) => event.no_injury).length);
  chart("department-chart", visible.flatMap(row => departments(row.event, row.people)));
  chart("type-chart", visible.map(({event}) => event.type || unknown));
  chart("body-chart", people.map(person => person.body || unknown));
  $("empty").hidden = visible.length > 0;
  $("empty").textContent = records.length ? "אין אירועים התואמים לסינון." : "אין עדיין אירועים. הוסף דיווח או ייבא את טבלת האקסל.";
  $("record-table").hidden = !visible.length;
  $("record-rows").replaceChildren(...visible.map(({event, people: matches}) => {
    const row = element("tr");
    const date = event.date ? dateFormat.format(new Date(event.date + "T00:00:00Z")) : "";
    for (const value of [
      event.number, [date, event.time].filter(Boolean).join(" · "), departments(event, matches).join(", "),
      event.type, event.description, [...new Set(matches.map(p => p.body).filter(Boolean))].join(", "),
      event.no_injury ? "0 (מאומת)" : event.people.length ? nf.format(matches.length) : "—",
    ]) row.append(element("td", value || "—"));
    const cell = element("td");
    const edit = element("button", "עריכה");
    edit.type = "button";
    edit.setAttribute("aria-label", "עריכת אירוע " + event.number);
    edit.onclick = () => {
      go("entry");
      showDraft(event);
    };
    cell.append(edit);
    row.append(cell);
    return row;
  }));
}

async function loadRecords() {
  records = await api("records");
  updateChoices();
  draw();
}

function makeFields(spec, values) {
  return spec.map(([key, label, kind = "text", cluster]) => {
    const wrapper = element("label", label, kind === "long" ? "long" : undefined);
    const input = element(kind === "long" ? "textarea" : "input");
    input.dataset.key = key;
    if (kind === "long") input.rows = 3;
    else input.type = kind;
    if (kind === "number") {
      input.min = "0";
      input.step = "1";
    }
    if (cluster) input.setAttribute("list", "choices-" + cluster);
    input.value = values[key] ?? "";
    wrapper.append(input);
    return wrapper;
  });
}

function collectFields(container) {
  return Object.fromEntries([...container.querySelectorAll("[data-key]")].map(input => [input.dataset.key, input.value]));
}

function refreshPeople() {
  const cards = [...$("people").children];
  cards.forEach((card, index) => card.querySelector("legend").textContent = "נפגע " + (index + 1));
  $("no-injury").disabled = cards.length > 0;
  $("add-person").disabled = $("no-injury").checked || cards.length >= 100;
}

function appendPerson(values = {}, focus = true) {
  const card = element("fieldset");
  const grid = element("div", undefined, "field-grid");
  grid.append(...makeFields(personFields, values));
  const remove = element("button", "הסר שורת נפגע");
  remove.type = "button";
  remove.onclick = () => {
    card.remove();
    refreshPeople();
    $("add-person").focus();
  };
  card.append(element("legend"), grid, remove);
  $("people").append(card);
  refreshPeople();
  if (focus) grid.querySelector("input").focus();
}

function showDraft(values = {}) {
  activeId = values.id ?? null;
  $("entry-title").textContent = activeId ? "עריכת אירוע " + values.number : "דיווח חדש";
  $("draft-title").textContent = activeId ? "פרטי האירוע" : "טיוטת האירוע";
  $("source-panel").hidden = Boolean(activeId);
  $("draft-form").hidden = false;
  $("event-fields").replaceChildren(...makeFields(eventFields, values));
  $("no-injury").checked = Boolean(values.no_injury);
  $("people").replaceChildren();
  for (const person of values.people || []) appendPerson(person, false);
  refreshPeople();
  $("draft-title").focus();
}

function syncScanPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  const file = $("scan").files[0];
  previewUrl = file ? URL.createObjectURL(file) : null;
  const link = $("scan-preview");
  if (previewUrl) link.href = previewUrl;
  else link.removeAttribute("href");
  link.hidden = !previewUrl;
}

function newEntry() {
  if (activeId === null && !$("entry").hidden) return;
  activeId = null;
  $("source-panel").hidden = false;
  $("draft-form").hidden = true;
  $("entry-title").textContent = "דיווח חדש";
  $("report-text").value = "";
  $("scan").value = "";
  $("transcript").value = "";
  $("transcript-panel").hidden = true;
  syncScanPreview();
  status("extract-status");
}

async function extract(corrected) {
  const buttons = [$("extract"), $("re-extract"), $("manual")];
  if (!$("draft-form").hidden && !window.confirm("החילוץ יחליף את הטיוטה הנוכחית. להמשיך?")) return;
  buttons.forEach(button => button.disabled = true);
  $("save").disabled = true;
  status("extract-status", "מחלץ נתונים במחשב. סריקה מרובת עמודים עשויה להימשך כמה דקות.");
  try {
    const file = corrected ? null : $("scan").files[0];
    const text = corrected ? $("transcript").value.trim() : $("report-text").value.trim();
    if (file && text) throw new Error("בחר טקסט או סריקה לכל דיווח");
    const result = await api("extract", file ? {data: await encodeFile(file)} : {text});
    if (file || corrected) {
      $("transcript").value = result.transcript;
      $("transcript-panel").hidden = false;
      if (corrected) result.draft.source = "סריקה";
    } else {
      $("transcript-panel").hidden = true;
    }
    showDraft(result.draft);
    status("extract-status", "הטיוטה מוכנה לבדיקה.");
  } catch (error) {
    status("extract-status", error.message, true);
  } finally {
    buttons.forEach(button => button.disabled = false);
    $("save").disabled = false;
  }
}

for (const button of document.querySelectorAll("[data-screen]")) {
  button.addEventListener("click", () => {
    if (button.dataset.screen === "entry") newEntry();
    go(button.dataset.screen);
  });
}
for (const key of filters) $(key + "-filter").onchange = draw;
$("clear-filters").onclick = () => {
  for (const key of filters) $(key + "-filter").value = "";
  draw();
};
$("scan").onchange = syncScanPreview;
$("extract").onclick = () => extract(false);
$("re-extract").onclick = () => extract(true);
$("manual").onclick = () => {
  if (!$("draft-form").hidden) {
    $("draft-title").focus();
    return;
  }
  const text = $("report-text").value.trim();
  showDraft({description: text, source: text ? "מלל" : $("scan").files[0] ? "סריקה" : "הזנה ידנית"});
};
$("no-injury").onchange = refreshPeople;
$("add-person").onclick = () => appendPerson();
$("draft-form").onsubmit = async event => {
  event.preventDefault();
  const row = collectFields($("event-fields"));
  row.people = [...$("people").children].map(collectFields);
  row.no_injury = $("no-injury").checked;
  if (activeId !== null) row.id = activeId;
  $("save").disabled = true;
  try {
    await api("save", row);
    $("draft-form").hidden = true;
    go("dashboard");
    status("notice", "האירוע נשמר.");
    await loadRecords();
  } catch (error) {
    status("notice", error.message, true);
    $("notice").scrollIntoView();
  } finally {
    $("save").disabled = false;
  }
};

function resetImport() {
  importData = null;
  $("workbook").value = "";
  $("import-review").hidden = true;
}

$("choose-import").onclick = () => $("workbook").click();
$("workbook").onchange = async () => {
  const file = $("workbook").files[0];
  if (!file) return;
  resetImport();
  $("choose-import").disabled = true;
  try {
    const data = await encodeFile(file);
    const result = await api("import/preview", {data});
    if (!result.records.length) {
      status("notice", "הקובץ מכיל כותרות ללא נתוני אירועים לייבוא.");
      return;
    }
    const existing = new Set(records.map(record => record.number));
    const conflicts = result.records.filter(record => existing.has(record.number)).length;
    $("import-message").textContent =
      "נמצאו " + result.records.length + " אירועים ו־" + result.people + " רשומות נפגעים." +
      (conflicts ? " " + conflicts + " מספרי אירוע שכבר קיימים יידלגו." : "");
    importData = data;
    $("import-review").hidden = false;
    $("confirm-import").focus();
  } catch (error) {
    status("notice", error.message, true);
  } finally {
    $("choose-import").disabled = false;
  }
};
$("cancel-import").onclick = resetImport;
$("confirm-import").onclick = async () => {
  if (!importData) return;
  const button = $("confirm-import");
  button.disabled = true;
  try {
    const {saved, conflicts} = await api("import", {data: importData});
    resetImport();
    status("notice", "יובאו " + saved + " אירועים." + (conflicts.length ? " דולגו מספרי אירוע קיימים: " + conflicts.join(", ") : ""));
    await loadRecords();
  } catch (error) {
    status("notice", error.message, true);
  } finally {
    button.disabled = false;
  }
};

loadRecords().catch(error => status("notice", error.message, true));
