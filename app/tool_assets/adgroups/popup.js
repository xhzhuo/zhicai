const countNode = document.getElementById("count");
const statusNode = document.getElementById("status");
const errorNode = document.getElementById("error");
const startButton = document.getElementById("start");
const currentButton = document.getElementById("current");
const exportButton = document.getElementById("export");
const diagnosticsButton = document.getElementById("diagnostics");
const clearButton = document.getElementById("clear");
let currentRecords = [];
let currentContext = {};

function showError(message) {
  errorNode.textContent = message;
  errorNode.hidden = !message;
}

function updateState(state) {
  currentRecords = state.records || [];
  currentContext = state.context || currentContext;
  countNode.textContent = state.expectedTotal ? `${currentRecords.length} / ${state.expectedTotal}` : String(currentRecords.length);
  statusNode.textContent = state.status || "等待采集";
  exportButton.disabled = currentRecords.length === 0;
  startButton.disabled = Boolean(state.running);
  currentButton.disabled = Boolean(state.running);
  showError(state?.ok === false ? (state.error || "无法读取当前页面。") : "");
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !String(tab.url || "").startsWith("https://ad.xiaohongshu.com/")) {
    throw new Error("请先打开小红书聚光后台页面，再点击此扩展。");
  }
  return tab;
}

async function send(type) {
  const tab = await activeTab();
  return chrome.tabs.sendMessage(tab.id, { type });
}

function dateStamp() {
  const date = new Date();
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function localDateTime() {
  const date = new Date();
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function exportXlsx() {
  if (!currentRecords.length) throw new Error("当前没有可导出的数据。");
  const sorted = [...currentRecords].sort((a, b) => a.campaignGroupName.localeCompare(b.campaignGroupName, "zh-CN"));
  const bytes = XlsxWriter.buildWorkbook(sorted, {
    ...currentContext,
    exportedAt: localDateTime()
  });
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `小红书聚光_广告组_${dateStamp()}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function refresh() {
  try {
    updateState(await send("GET_STATE"));
  } catch (error) {
    showError(error.message.includes("Receiving end") ? "扩展刚安装后需要刷新一次聚光页面。" : error.message);
    statusNode.textContent = "尚未连接到聚光页面";
  }
}

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  currentButton.disabled = true;
  statusNode.textContent = "正在自动翻页，请不要切换页面…";
  showError("");
  try {
    const state = await send("COLLECT_ALL");
    updateState(state);
    if (state?.ok && state.completed && state.records?.length) exportXlsx();
  } catch (error) {
    showError(error.message);
  } finally {
    startButton.disabled = false;
    currentButton.disabled = false;
  }
});

currentButton.addEventListener("click", async () => {
  try {
    updateState(await send("SCRAPE_CURRENT"));
  } catch (error) {
    showError(error.message);
  }
});

exportButton.addEventListener("click", () => {
  try {
    exportXlsx();
  } catch (error) {
    showError(error.message);
  }
});

clearButton.addEventListener("click", async () => {
  try {
    updateState(await send("CLEAR"));
  } catch (error) {
    showError(error.message);
  }
});

diagnosticsButton.addEventListener("click", async () => {
  try {
    const response = await send("GET_DIAGNOSTICS");
    if (!response?.ok) throw new Error(response?.error || "无法读取分页诊断信息。");
    const blob = new Blob([JSON.stringify(response.diagnostics, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `小红书聚光_分页诊断_${dateStamp()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    showError(error.message);
  }
});

refresh();

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === "XHS_ADGROUP_PROGRESS" && message.state) updateState(message.state);
});
