# 汉化维护与上游同步

本项目保留上游英文源码，在界面显示位置使用 i18next / react-i18next 翻译。英文原句就是 key，`keySeparator: false`、`nsSeparator: false` 使句中的点号和冒号也属于 key。不要把业务状态、API 字段、服务名称、用户备注或服务器返回的数据改成中文。

## 文件与基本约定

- `frontend/src/i18n/index.js` 初始化语言与字典，并提供非组件代码可用的 `t`。
- `frontend/src/i18n/core.js` 管理英文回退、语言选择、持久化和字典校验。
- `frontend/src/i18n/locales/zh-CN/*.json` 是随应用打包的扁平中文词典，按 `app.json`、`shared.json`、`auth-settings.json`、`layout-batch.json`、`service-port.json` 等文件分工；`changelog.json` 保存已收录的更新日志翻译。
- `scripts/check-i18n.mjs` 检查字典和界面源码，`scripts/check-i18n.test.mjs` 用独立源码片段测试检查器本身。
- `scripts/i18n-allowlist.json` 逐条记录允许保留原文的品牌名、命令、快捷键及地址示例，并为每个字符串说明理由。

没有中文翻译时，i18next 回退到英文原句。语言切换不应改变业务行为，遗漏翻译也不应使界面空白。回退只是运行时保障；已知的英文 key 没有中文词条时，维护检查仍然失败。

优先在现有词典中补充条目；如果新增词典文件，还必须在 `frontend/src/i18n/index.js` 中导入并加入 `catalogs`。检查器会读取该目录的全部 JSON，但无法证明每个文件都已接入运行时。

## 新增或更新翻译

尽量只改显示文字及其必要的翻译调用，保留组件结构、事件、条件判断、状态值和数据处理逻辑。例如：

```jsx
import { useTranslation } from 'react-i18next';

function RefreshButton({ count, onRefresh }) {
  const { t } = useTranslation();
  return (
    <button onClick={onRefresh} title={t('Refresh services')}>
      {t('Refresh {{count}} services', { count })}
    </button>
  );
}
```

在所属词典中加入：

```json
{
  "Refresh services": "刷新服务",
  "Refresh {{count}} services": "刷新 {{count}} 个服务"
}
```

保留完整句子与上下文，使用插值传入数量、名称等数据，避免把一句话拆成多个片段或构造动态 key。中文可以调整占位符顺序和空格，但必须保留名称、出现次数、转义标记（例如 `{{- name}}`）及格式化器（例如 `{{count, number}}`）。检查器会拒绝缺失、增加或改名的占位符。不同词典中同一英文 key 的中文必须一致；上下文确实不同，应先重新审视英文句子，而不是依赖词典加载顺序。

组件内使用 `useTranslation()`，让切换语言触发重新渲染；非组件帮助函数在调用时翻译。不要在模块加载时把翻译结果永久缓存。依赖翻译结果的 `useMemo` 等缓存应包含 `t` 等必要依赖。更新英文原句时，同时更新 key 与中文翻译，并检查旧 key 是否仍有调用。

`title`、`placeholder`、`aria-label`、`alt`、按钮文字、空状态、菜单标签、提示和应用自己定义的错误信息都需要考虑。用户输入、容器名称、环境变量、URL 和命令参数继续保留原始数据。

允许原样显示的固定品牌或示例，才加入 allowlist。例如 `"Docker": "产品名称，保持上游拼写。"`。匹配是折叠空白后的完整字符串精确匹配；不会把 `Docker settings` 一并放行，也不会绕过 `t('Docker')` 的缺词条检查。不要添加组件路径、目录级排除、正则或通配符。对模板字符串，清单中的 `${…}` 只是检查器显示动态表达式的记号，其他文字仍精确匹配；仅用于应原样展示的 URL、命令等技术示例。

## 合并上游更新

先检查 `git status`，保存自己的修改，在已有汉化实现的本地分支上开始维护。以下命令是供维护者手动执行的流程；分支名请按实际情况调整。

第一次配置上游远程时：

```sh
git remote -v
git remote add upstream https://github.com/mostafa-wahied/portracker.git
```

如果已经存在 `upstream`，核对其地址后跳过 `remote add`。随后从当前汉化分支创建本地更新分支，获取上游并合并：

```sh
git switch -c codex/sync-localization
git fetch upstream
git branch -r
git merge upstream/main
```

`upstream/main` 应以实际获取到的上游目标分支为准；更新分支已存在时，用 `git switch codex/sync-localization` 继续维护。这个流程保留正常的 Git 历史，但不能保证自动合并没有冲突。

发生冲突时逐处阅读上游改动：保留新的行为、事件参数、条件分支与数据结构，并在新的可见英文文字外保留或补回 `t(...)` 包装。上游如果改了句子，应按新句子更新词典；不要整文件选用某一侧，也不要为通过检查把旧行为覆盖回去。通过 `git status` 确认冲突文件，解决后按正常 Git 合并流程完成合并。

合并与翻译完成后，在仓库根目录运行：

```sh
npm ci
npm ci --prefix frontend
npm run i18n:inventory
npm run i18n:check
npm run test:i18n
npm run test:frontend
npm run lint
npm run build --prefix frontend
```

`npm ci --prefix frontend` 安装锁文件指定的依赖，包含检查器显式使用的 `@babel/parser`；不要依赖根目录或全局安装的解析器。字典及翻译库随应用打包，运行时不需要访问外部翻译服务。

维护命令的含义：

| 命令 | 用途 |
| --- | --- |
| `npm run i18n:inventory` | 输出候选未翻译文字、缺词条、字典问题与动态 key 的文件、行、列；覆盖率问题不阻止清点，无法读取或解析输入时仍失败。 |
| `npm run i18n:check` | 缺少静态 key、翻译冲突、占位符不一致、硬编码可见英文或输入损坏时返回非零状态。 |
| `npm run test:i18n` | 运行 i18n 核心、格式化、健康状态翻译及检查器的源码片段测试。 |

也可直接运行 `node scripts/check-i18n.mjs`、`node scripts/check-i18n.mjs --inventory`，以及 `node --test frontend/src/i18n/core.test.mjs scripts/check-i18n.test.mjs`。检查器按自身所在的仓库定位文件，不依赖终端当前目录。检查器沿用项目现有的 Babel 7 解析器；CI 使用 Node.js 22。

新增上游标签时，先看 inventory 给出的 `文件:行:列`，补充翻译调用和词条，再运行 check。最后在浏览器中切换 English / 简体中文，检查登录、设置、弹窗、列表、空状态、提示、移动端与主题，并验证刷新后语言选择仍然保留。CI 只运行 i18n 测试与检查；不能替代这些交互检查。

## 检查范围与人工检查

检查器使用 Babel AST，扫描 `frontend/src` 下的生产 JavaScript / JSX / TypeScript 文件，跳过 `.test.*` 与 `.spec.*` 测试文件，不按组件整体豁免。它检查 `t(...)` / `i18n.t(...)` 的静态 key、JSXText、可见子表达式以及 `title`、`placeholder`、`aria-label`、`alt` 等显示属性，也检查提交按钮的 `value`，并阻止在 `source`、`id`、`key`、`type`、`role`、`name`、`variant` 等结构属性中直接调用翻译。可跟踪同一文件中的部分变量、对象、数组、map 参数、memo 回调、函数返回值和状态赋值；条件分支只检查可能显示的值，不把比较使用的枚举或 CSS 类名当作界面文案。ASCII 字母用于筛选英文候选，不是自然语言识别。

以下情况需要人工确认，不能因为检查通过就宣称全界面已覆盖：

- 运行时拼接的 key、复杂控制流、跨文件传值、跨函数参数、展开属性以及未识别的包装函数。已发现但不能静态解析的 `t(...)` 会以 `dynamic-key` 提醒，作为清点信息而不单独阻止 check。优先改用明确的英文句子和插值，并增加针对实际分支的检查。
- API 返回的错误、后端诊断、系统原生状态、用户输入和服务数据。检查器不会推断其运行时内容或自动修改后端消息。应用自己提供的已知提示应通过明确的翻译调用处理；未知诊断保留原文，方便排障。
- `CHANGELOG.md` 经上游更新日志解析后展示的版本说明、功能标题与说明正文。已收录到 `changelog.json` 的条目有中文翻译，未收录的新版本或历史条目继续回退到英文；动态内容的覆盖程度仍需人工核对。弹窗自身的按钮、标题和固定分类需要翻译。检查器不会自动翻译上游内容，也不豁免整个更新弹窗。
- 通过函数库、HTML 注入或其他运行时方式生成的文案，以及文字是否准确自然、截断、换行和无障碍体验。仍需人工审阅和实际浏览器验证。

静态检查用于及时发现常见回归，并使后续合并的修复位置可见；它不会自动解决 Git 冲突，也不会自动翻译上游的新内容。
