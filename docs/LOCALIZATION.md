# 汉化维护与上游同步

本项目保留上游英文源码，在界面显示位置使用 `i18next` / `react-i18next` 翻译。英文原句就是 key，`keySeparator: false`、`nsSeparator: false` 使句中的点号和冒号也属于 key。不要把业务状态、API 字段、服务名称、用户备注或服务器返回的数据改成中文。

维护入口：[上游更新后的完整流程](#上游更新后的完整流程) · [新增或更新翻译](#新增或更新翻译) · [维护命令速查](#维护命令速查) · [Docker Compose 部署](DOCKER_COMPOSE_CN.md)

## 文件与基本约定

- `frontend/src/i18n/index.js` 初始化语言与字典，并提供非组件代码可用的 `t`。
- `frontend/src/i18n/core.js` 管理英文回退、语言选择、持久化和字典校验。
- `frontend/src/i18n/locales/zh-CN/*.json` 是随应用打包的扁平中文词典，按 `app.json`、`shared.json`、`auth-settings.json`、`layout-batch.json`、`service-port.json` 等文件分工；`changelog.json` 保存已收录的更新日志翻译。
- `scripts/check-i18n.mjs` 检查字典和界面源码，`scripts/check-i18n.test.mjs` 用独立源码片段测试检查器本身。
- `scripts/i18n-allowlist.json` 逐条记录允许保留原文的品牌名、命令、快捷键及地址示例，并为每个字符串说明理由。

没有中文翻译时，`i18next` 回退到英文原句。语言切换不应改变业务行为，遗漏翻译也不应使界面空白。回退只是运行时保障；已知的英文 key 没有中文词条时，维护检查仍然失败。

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

## 上游更新后的完整流程

下面的命令都在**仓库根目录**执行，PowerShell 与常见 Linux shell 均可逐条运行。使用当前 CI 和 `Dockerfile` 对应的 Node.js 22 与 npm；以后上游调整运行时版本时，也要核对这些配置。流程是：更新本地 `main` → 在维护分支合并上游 → 补齐汉化 → 验证 → 合回 `main` 并推送 → 重新打包部署。

### 1. 首次配置上游仓库

先区分两个远程仓库：

| 远程名 | 指向 | 用途 |
| --- | --- | --- |
| `origin` | 自己的 Fork，例如 `liuyuays/portracker-cn` | 保存、推送汉化版及维护提交。 |
| `upstream` | `mostafa-wahied/portracker` | 获取官方更新。 |

查看现有配置：

~~~sh
git remote -v
~~~

没有 `upstream` 时添加一次：

~~~sh
git remote add upstream https://github.com/mostafa-wahied/portracker.git
~~~

已有 `upstream` 时跳过添加，使用 `git remote get-url upstream` 核对地址。`origin` 应继续指向自己的 Fork。以后每轮更新从下一步开始即可。

### 2. 查看更新并创建维护分支

先运行 `git status --short`；有未提交内容时先提交或自行暂存，工作区干净后继续：

~~~sh
git switch main
git pull --ff-only origin main
git fetch upstream
git remote show upstream
~~~

检查 `git remote show upstream` 输出中的 `HEAD branch`。下文以官方分支 `main` 为例；若实际上游使用其他分支，把 `upstream/main` 替换成对应分支，本地分支仍使用 `main`。

查看尚未合并的提交及文件范围：

~~~sh
git log --oneline main..upstream/main
git diff --stat main...upstream/main
git diff --name-only main...upstream/main -- frontend/src CHANGELOG.md
~~~

第一条没有输出，表示当前 `main` 已包含该上游分支的全部提交，无需再次合并；如有遗漏翻译，仍可以单独补充。查看更新日志时一并确认是否有新的运行时、配置或数据迁移要求。

有上游更新时，从已经同步的 `main` 新建维护分支，并开始合并：

~~~sh
git switch -c codex/sync-localization
git merge --no-ff --no-commit upstream/main
~~~

合并没有冲突时也会停在提交前，便于把这轮翻译和验证完成后一起提交。有冲突时先按下一步解决。维护分支名称可自行更换；同名分支已有未完成工作时先切回它继续，不要直接删除。新一轮使用新名称时，后续命令也要替换为同一名称。

### 3. 解决冲突并保留新的功能

~~~sh
git status
git diff --name-only --diff-filter=U
~~~

逐个阅读冲突文件，按以下原则合并：

| 文件 | 合并方式 |
| --- | --- |
| `frontend/src` 下的组件与帮助函数 | 保留上游新的行为、事件参数、条件和数据结构，在新的可见英文文字外补回 `t(...)`；同时保留语言初始化、语言切换入口和必要的 `useTranslation` 调用。 |
| 中文 JSON 词典 | 保留仍在使用的翻译，按上游新的英文原句补充 key；检查占位符以及不同文件中相同 key 的译文。 |
| `package.json` 与对应的 `package-lock.json` | 合并新依赖，保留 `i18next`、`react-i18next`、检查器使用的 `@babel/parser` 和根目录维护命令；清单与锁文件必须一致，再安装依赖。 |
| `Dockerfile` 与 `docker-compose.yml` | 接收上游构建、运行环境和部署变更；汉化部署差异继续放在 `compose.cn.yaml`，随后验证打包结果。 |

业务源码不要整文件选用一侧，也不要为了保留翻译覆盖掉上游修复。

前端锁文件难以手工合并时，在 `frontend/package.json` 已合并双方依赖的前提下，可仅以上游锁文件为基础重新补齐：

~~~sh
git restore --source=upstream/main -- frontend/package-lock.json
npm install --package-lock-only --ignore-scripts --prefix frontend
~~~

复查锁文件中的翻译依赖和其他版本差异，再把清单与锁文件一起标记为已解决。存在本地依赖版本定制时，先确认这些要求已体现在合并后的 `package.json` 中，必要时保留相应的锁定版本。

每个冲突处理完后，用 `git add` 加上实际文件路径标记为已解决；`git diff --name-only --diff-filter=U` 必须不再输出文件。暂时不要完成合并提交，继续补充翻译与验证。

如果要放弃本次尚未提交的合并：

~~~sh
git merge --abort
~~~

这会撤销本轮合并及其冲突处理结果；需要保留的人工修改先另行保存。该命令用于合并仍在进行时。

### 4. 找到新增文字并补齐汉化

安装维护工具和前端依赖：

~~~sh
npm ci --ignore-scripts
npm ci --prefix frontend
npm run i18n:inventory
~~~

第一条用于翻译检查与源码打包，不编译根目录的原生 SQLite 模块；它不能代替后端测试环境的完整安装。`frontend` 的依赖含检查器显式使用的 `@babel/parser`，不能只装根目录依赖或依赖全局解析器。

`inventory` 输出文件、行、列及问题类型，按下表逐项处理：

| 类型 | 处理方式 |
| --- | --- |
| `hardcoded` | 找到界面中的新增英文文字，使用 `useTranslation` 和 `t(...)` 包装，并补充中文词条。 |
| `missing-key` | 已有静态 `t(...)` 调用，但缺少中文；在所属词典补充同一英文 key。 |
| `interpolation-mismatch` | 中文与英文的占位符不一致，保留名称、数量、转义方式与格式化器。 |
| `conflicting-translation` | 同一英文 key 出现不同中文译文，统一或重新审视英文上下文。 |
| `dynamic-key` | 静态分析无法确定运行时内容，人工检查实际页面、数据来源及各分支。 |
| `parse-error` / `catalog-error` 等 | 先修复源码语法、JSON 或输入文件问题，再检查翻译。 |

按上面的[新增或更新翻译](#新增或更新翻译)示例修改。上游改了英文原句时，翻译调用与词典 key 一起更新；旧词条确认没有其他调用后再删除。只有真正需要原样展示的品牌、命令或地址才加入精确 allowlist，不能用它跳过待翻译的界面文字。

还要人工检查本轮新增页面、弹窗、提示和 `CHANGELOG.md`。更新日志弹窗中的功能标题、描述与明细使用运行时 key，新增版本需要把实际展示的英文原句加入 `changelog.json`；静态检查不会自动替你补译。后台错误、健康诊断等动态消息也要检查；应用已知文案按现有映射翻译，未知外部诊断保留原文。

没有 Git 冲突不代表新增功能已经汉化；`inventory` 只是清点工具，也不等于覆盖率检查已通过。

### 5. 运行检查并检查实际界面

在仓库根目录逐条运行，遇到失败先修复再继续：

~~~sh
npm run i18n:check
npm run test:i18n
npm run test:frontend
npm run test:package:docker
npm run lint
npm run build --prefix frontend
git diff --check
~~~

这些检查覆盖翻译、相关前端行为、打包、代码规范和前端构建。实际覆盖范围以本轮上游变更为准：如果更新涉及后端或发布流程，还要按上游 CI 完整安装根目录与 `backend` 依赖，并运行相关检查。例如本仓库沿用的发布工作流包含：

~~~sh
npm ci
npm ci --prefix backend
npm test -- --runInBand
npm run test:release
npm run test:context
~~~

完整安装可能需要本机的原生模块编译环境；也可以在匹配 CI 的环境中验证。`npm run test:context` 会执行 Docker 构建，也需要安装 Docker。镜像构建与运行检查不能用前端构建或源码打包的成功代替。

在可运行的应用中切换 English / 简体中文，检查本轮新增功能以及登录、设置、弹窗、列表、空状态、提示、移动端、主题，并验证刷新后语言选择仍然保留。重点查看中文长度造成的截断、换行及无障碍标签。现有 i18n 工作流只执行 i18n 测试与静态检查，不能代替这些交互检查。

### 6. 提交到 main 并推送自己的仓库

检查本轮全部变更，确认冲突已经解决、检查通过，再提交合并结果：

~~~sh
git status
git add --all
git diff --cached --check
git diff --cached --stat
git commit -m "chore: sync upstream and update Chinese translations"
git switch main
git merge --ff-only codex/sync-localization
git push origin main
git status --short --branch
~~~

这个流程保留上游提交的父子关系，下一轮 Git 可以识别哪些官方更新已经合并。不要用 squash 合并本轮上游同步，也不要把 `main` 重置成上游分支或强制推送。

如果本地 `main` 在维护期间也有新提交，最后的 `--ff-only` 可能失败；把 `main` 的新提交合并到维护分支并重新验证后，再合回 `main`。如果推送被拒绝，先 `git fetch origin`，再合并 `origin/main`、解决冲突并重新验证，最后正常推送。

成功推送且工作区干净后，可删除已合并的临时分支，方便下次继续使用该名称：

~~~sh
git branch -d codex/sync-localization
~~~

### 7. 重新打包并更新 Docker 部署

提交后的源码可直接生成新的部署包：

~~~sh
npm run package:docker
~~~

按[Docker Compose 部署文档](DOCKER_COMPOSE_CN.md#4-更新汉化版)将 `deploy/app` 的完整内容（包含隐藏文件）同步到原部署目录，保留服务器已有的 `.env`（数据位于部署目录上一级的 `portracker-data`，不受同步影响），再在服务器的部署包目录运行：

~~~sh
docker compose -f docker-compose.yaml config --quiet
docker compose -f docker-compose.yaml up -d --build
docker compose -f docker-compose.yaml ps
docker compose -f docker-compose.yaml logs --tail=100 portracker
~~~

语言资源随前端镜像打包，每轮汉化后需要重新构建并启动容器。检查服务健康状态与本轮页面的中英文显示。部署目录中的 `docker-compose.yaml` 由打包生成；源码仍保留上游 `docker-compose.yml` 和独立 `compose.cn.yaml`，后续继续按此流程同步。

## 维护命令速查

| 命令 | 用途 |
| --- | --- |
| `npm run i18n:inventory` | 输出候选未翻译文字、缺词条、字典问题与动态 key 的文件、行、列；覆盖率问题不阻止清点，无法读取或解析输入时仍失败。 |
| `npm run i18n:check` | 缺少静态 key、翻译冲突、占位符不一致、硬编码可见英文或输入损坏时返回非零状态。 |
| `npm run test:i18n` | 运行 i18n 核心、格式化、健康状态翻译及检查器的源码片段测试。 |
| `npm run test:package:docker` | 检查部署包生成、Compose 合并、旧文件清理和配置、数据保留行为。 |
| `npm run package:docker` | 从当前源码生成 `deploy/app` 中的可部署文件。 |

也可直接运行 `node scripts/check-i18n.mjs` 或 `node scripts/check-i18n.mjs --inventory`。检查器按自身所在的仓库定位文件，不依赖终端当前目录。字典及翻译库随应用打包，运行时不需要访问外部翻译服务。

## 检查范围与人工检查

检查器使用 Babel AST，扫描 `frontend/src` 下的生产 JavaScript / JSX / TypeScript 文件，跳过 `.test.*` 与 `.spec.*` 测试文件，不按组件整体豁免。它检查 `t(...)` / `i18n.t(...)` 的静态 key、JSXText、可见子表达式以及 `title`、`placeholder`、`aria-label`、`alt` 等显示属性，也检查提交按钮的 `value`，并阻止在 `source`、`id`、`key`、`type`、`role`、`name`、`variant` 等结构属性中直接调用翻译。可跟踪同一文件中的部分变量、对象、数组、map 参数、memo 回调、函数返回值和状态赋值；条件分支只检查可能显示的值，不把比较使用的枚举或 CSS 类名当作界面文案。ASCII 字母用于筛选英文候选，不是自然语言识别。

以下情况需要人工确认，不能因为检查通过就宣称全界面已覆盖：

- 运行时拼接的 key、复杂控制流、跨文件传值、跨函数参数、展开属性以及未识别的包装函数。已发现但不能静态解析的 `t(...)` 会以 `dynamic-key` 提醒，作为清点信息而不单独阻止 check。优先改用明确的英文句子和插值，并增加针对实际分支的检查。
- API 返回的错误、后端诊断、系统原生状态、用户输入和服务数据。检查器不会推断其运行时内容或自动修改后端消息。应用自己提供的已知提示应通过明确的翻译调用处理；未知诊断保留原文，方便排障。
- `CHANGELOG.md` 经上游更新日志解析后展示的版本说明、功能标题与说明正文。已收录到 `changelog.json` 的条目有中文翻译，未收录的新版本或历史条目继续回退到英文；动态内容的覆盖程度仍需人工核对。弹窗自身的按钮、标题和固定分类需要翻译。检查器不会自动翻译上游内容，也不豁免整个更新弹窗。
- 通过函数库、HTML 注入或其他运行时方式生成的文案，以及文字是否准确自然、截断、换行和无障碍体验。仍需人工审阅和实际浏览器验证。

静态检查用于及时发现常见回归，并使后续合并的修复位置可见；它不会自动解决 Git 冲突，也不会自动翻译上游的新内容。
