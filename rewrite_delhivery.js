const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, 'public/admin/index.html');
const dlvPath = path.join(__dirname, 'public/admin/delhivery.html');

let adminHtml = fs.readFileSync(adminPath, 'utf8');
let dlvHtml = fs.readFileSync(dlvPath, 'utf8');

// Extract the body content from delhivery.html
const bodyMatch = dlvHtml.match(/<body>([\s\S]*?)<\/body>/);
if (!bodyMatch) {
  console.error("Could not find body in delhivery.html");
  process.exit(1);
}

let dlvBody = bodyMatch[1];

// Extract JS
const jsMatch = dlvBody.match(/<script>([\s\S]*?)<\/script>/);
let dlvJs = '';
if (jsMatch) {
  dlvJs = jsMatch[1];
  dlvBody = dlvBody.replace(/<script>[\s\S]*?<\/script>/, '');
}

// Rewrite classes to avoid conflict with admin panel
// sidebar -> dlv-nav
dlvBody = dlvBody.replace(/class="sidebar"/g, 'class="dlv-nav"');
// main -> dlv-panels
dlvBody = dlvBody.replace(/class="main"/g, 'class="dlv-panels"');
// panel -> dlv-panel
dlvBody = dlvBody.replace(/class="panel/g, 'class="dlv-panel');
// topbar -> dlv-topbar
dlvBody = dlvBody.replace(/class="topbar"/g, 'class="dlv-topbar"');
// page-title -> dlv-topbar-title
dlvBody = dlvBody.replace(/class="page-title"/g, 'class="dlv-topbar-title"');
// api-key-display -> dlv-key-badge
dlvBody = dlvBody.replace(/class="api-key-display"/g, 'class="dlv-key-badge"');
// env-badge -> dlv-env-badge
dlvBody = dlvBody.replace(/class="env-badge"/g, 'class="dlv-env-badge"');
// env-dot -> dlv-env-dot
dlvBody = dlvBody.replace(/class="env-dot"/g, 'class="dlv-env-dot"');
// nav-section -> dlv-nav-section
dlvBody = dlvBody.replace(/class="nav-section"/g, 'class="dlv-nav-section"');
// nav-label -> dlv-nav-label
dlvBody = dlvBody.replace(/class="nav-label"/g, 'class="dlv-nav-label"');
// nav-item -> dlv-nav-item
dlvBody = dlvBody.replace(/class="nav-item/g, 'class="dlv-nav-item');
// endpoint-pill -> dlv-pill
dlvBody = dlvBody.replace(/class="endpoint-pill"/g, 'class="dlv-pill"');
// method -> m
dlvBody = dlvBody.replace(/class="method /g, 'class="m ');
// form-grid -> dlv-fg
dlvBody = dlvBody.replace(/class="form-grid/g, 'class="dlv-fg');
dlvBody = dlvBody.replace(/class="dlv-fg single"/g, 'class="dlv-fg one"');
// field -> dlv-f
dlvBody = dlvBody.replace(/class="field"/g, 'class="dlv-f"');
// btn -> dlv-btn
dlvBody = dlvBody.replace(/class="btn /g, 'class="dlv-btn ');
dlvBody = dlvBody.replace(/class="btn"/g, 'class="dlv-btn"');
// action-row -> dlv-actions
dlvBody = dlvBody.replace(/class="action-row"/g, 'class="dlv-actions"');
// response-box -> dlv-resp
dlvBody = dlvBody.replace(/class="response-box"/g, 'class="dlv-resp"');
// response-header -> dlv-resp-hd
dlvBody = dlvBody.replace(/class="response-header"/g, 'class="dlv-resp-hd"');
// status-badge -> dlv-badge
dlvBody = dlvBody.replace(/class="status-badge/g, 'class="dlv-badge');
// response-body -> dlv-resp-body
dlvBody = dlvBody.replace(/class="response-body"/g, 'class="dlv-resp-body"');
// stat-row -> dlv-stat-row
dlvBody = dlvBody.replace(/class="stat-row"/g, 'class="dlv-stat-row"');
// stat-card -> dlv-stat
dlvBody = dlvBody.replace(/class="stat-card"/g, 'class="dlv-stat"');
// stat-label -> dlv-stat-label
dlvBody = dlvBody.replace(/class="stat-label"/g, 'class="dlv-stat-label"');
// stat-val -> dlv-stat-val
dlvBody = dlvBody.replace(/class="stat-val/g, 'class="dlv-stat-val');
// section-title -> dlv-section-title
dlvBody = dlvBody.replace(/class="section-title"/g, 'class="dlv-section-title"');
// tab-row -> dlv-tab-row
dlvBody = dlvBody.replace(/class="tab-row"/g, 'class="dlv-tab-row"');
// tab -> dlv-tab
dlvBody = dlvBody.replace(/class="tab /g, 'class="dlv-tab ');
dlvBody = dlvBody.replace(/class="tab"/g, 'class="dlv-tab"');
// timeline -> dlv-timeline  (wait, css uses .timeline or .dlv-timeline? the css I injected uses .dlv-tl-item etc.)
dlvBody = dlvBody.replace(/class="timeline"/g, 'class="dlv-timeline"');
dlvBody = dlvBody.replace(/class="tl-item"/g, 'class="dlv-tl-item"');
dlvBody = dlvBody.replace(/class="tl-dot /g, 'class="dlv-tl-dot ');
dlvBody = dlvBody.replace(/class="tl-dot"/g, 'class="dlv-tl-dot"');
dlvBody = dlvBody.replace(/class="tl-status"/g, 'class="dlv-tl-status"');
dlvBody = dlvBody.replace(/class="tl-meta"/g, 'class="dlv-tl-meta"');
dlvBody = dlvBody.replace(/class="warn-box"/g, 'class="dlv-warn-box"');

// Wrap in dlv-console and dlv-body
let finalHtml = `
      <div class="dlv-console">
        ${dlvBody.replace('<aside', '<div class="dlv-body"><aside').replace('</main>', '</main></div>')}
      </div>
`;

// Replace iframe in admin html
const iframeRegex = /<div class="page" id="page-delhivery" style="padding:0;">\s*<iframe.*?><\/iframe>\s*<\/div>/;
if (adminHtml.match(iframeRegex)) {
  adminHtml = adminHtml.replace(iframeRegex, `<div class="page" id="page-delhivery" style="padding:0;">${finalHtml}</div>`);
} else {
  console.log("Could not find iframe div in index.html");
}

// Adjust JS to not conflict
// nav -> navDlv
dlvJs = dlvJs.replace(/function nav\(/g, 'function navDlv(');
dlvJs = dlvJs.replace(/=> nav\(/g, '=> navDlv(');
// update document selectors to use dlv- classes
dlvJs = dlvJs.replace(/\.nav-item/g, '.dlv-nav-item');
dlvJs = dlvJs.replace(/\.panel/g, '.dlv-panel');
dlvJs = dlvJs.replace(/\.tab-row/g, '.dlv-tab-row');
dlvJs = dlvJs.replace(/\.tab/g, '.dlv-tab');
dlvJs = dlvJs.replace(/status-badge/g, 'dlv-badge');
dlvJs = dlvJs.replace(/tl-item/g, 'dlv-tl-item');
dlvJs = dlvJs.replace(/tl-dot/g, 'dlv-tl-dot');
dlvJs = dlvJs.replace(/tl-status/g, 'dlv-tl-status');
dlvJs = dlvJs.replace(/tl-meta/g, 'dlv-tl-meta');
// Remove init config call from root to avoid running on dashboard load, put it in showPage('delhivery')
dlvJs = dlvJs.replace(/loadConfig\(\);/, '');

// Inject JS into index.html
const jsInject = `
// ==========================================
// DELHIIVERY CONSOLE LOGIC
// ==========================================
${dlvJs}
`;

adminHtml = adminHtml.replace('// ===== PAGES =====', jsInject + '\n// ===== PAGES =====');

// Fix passTokenToFrame
adminHtml = adminHtml.replace(/if \(name === 'delhivery'\) passTokenToFrame\(\);/g, "if (name === 'delhivery') loadConfig();");
adminHtml = adminHtml.replace(/function passTokenToFrame\(\) {[\s\S]*?}/g, "");

// Modify getToken to just return TOKEN
adminHtml = adminHtml.replace(/function getToken\(\) {[\s\S]*?}/g, "function getToken() { return TOKEN; }");

fs.writeFileSync(adminPath, adminHtml);
console.log("Successfully integrated delhivery console natively.");
