# 使用 Docker Compose 部署汉化版

汉化版需要用当前源码构建镜像。原有 `docker-compose.yml` 指向官方镜像；本项目新增 `compose.cn.yaml`，叠加后改为本地构建 `portracker-cn:local`，并默认开启登录认证。

两个配置文件一起使用，继续继承上游的端口、重启策略、SQLite 数据目录、Docker socket、进程命名空间、权限和健康检查设置。后续同步上游时，部署覆盖文件可以独立保留。

## 一键生成部署目录

首次在干净源码目录使用时，先执行 `npm ci --ignore-scripts` 安装项目依赖；打包脚本复用项目已有的 js-yaml。之后在项目根目录运行：

~~~sh
npm run package:docker
~~~

命令会把当前工作区的汉化源码和 Docker 构建所需文件整理到 `deploy/app/`，无需本机安装 Docker，也无需提交 Git。依赖目录、旧构建产物、测试、真实环境变量、密钥和数据库不会进入部署包。

把整个 `deploy/app/` 目录复制到 Docker 主机，在复制后的目录中执行：

~~~sh
docker compose -f docker-compose.yaml config --quiet
docker compose -f docker-compose.yaml up -d --build
~~~

打包时读取源码目录中的 `docker-compose.yml` 和 `compose.cn.yaml`，合成部署包内唯一的 `docker-compose.yaml`，因此部署时不再需要手动传两个 `-f` 参数。`README.md` 包含部署步骤，`.env.example` 提供可选配置模板；镜像在部署主机上联网构建。

重复打包会根据 `.portracker-package.json` 清单更新生成文件并清理过期源码，同时保留输出目录已有的 `.env`、`portracker-data/` 和其他非生成文件。请保留该清单；对生成的源码和 Compose 配置所做的手工修改会被下次打包覆盖。复制新包到正在使用的服务器目录时，也要保留 `.env` 和数据目录。

旧版部署包中的 `compose.yaml` 和 `compose.override.yaml` 会在重新打包时根据清单自动移除。若服务器仍留有旧文件，更新时显式运行 `docker compose -f docker-compose.yaml up -d --build`，避免自动选中旧配置。合并不会读取本机 `.env`、展开环境变量或把相对路径转换为本机绝对路径。

合并器支持当前覆盖配置用到的标量、映射、环境变量列表与映射，以及 command、entrypoint、healthcheck.test 的替换。需要合并其他已有列表时会明确报错，避免静默采用错误规则；这类自定义设置请在基础 `docker-compose.yml` 中修改后重新打包，或使用下面的原始分层配置部署。

`deploy/` 已加入 Git、Docker 构建上下文和 lint 的排除范围。可运行 `npm run test:package:docker` 验证打包行为。

以下步骤用于直接从完整源码部署；使用上面的部署包时，按包内 README 操作即可。

## 1. 准备部署目录

在需要监控的服务器上安装 Docker Engine 和 Docker Compose 插件。确认以下命令可用：

```sh
docker version
docker compose version
```

以下以 Linux 服务器 / NAS 为例。把包含本次汉化改动的完整项目源码放到部署目录，再进入该目录，例如：

```sh
cd /opt/portracker-cn
```

目录需要包含 `Dockerfile`、`docker-compose.yml`、`compose.cn.yaml`、根目录的包文件与更新日志，以及 `frontend/`、`backend/` 源码。

如果汉化修改尚未提交并推送到自己的仓库，只执行 `git clone` 不会取得本地未提交的修改。可以复制当前工作区源码，或提交推送后在服务器拉取。构建不需要复制本机的 `node_modules` 和前端构建产物；`Dockerfile` 会安装依赖并构建前端。

## 2. 配置环境变量

可以直接启动：默认开启登录认证；未提供 SESSION_SECRET 时后端会生成随机签名密钥。首次访问通过初始化向导创建管理员账户。

如需显式配置，在项目根目录创建或编辑 `.env`：

```dotenv
ENABLE_AUTH=true
SESSION_SECRET=替换成自己生成的随机字符串
```

Linux 上可用 `openssl rand -hex 32` 生成随机值，然后填入 SESSION_SECRET。不要使用上面的示例文字作为密钥。如果已有 `.env`，合并需要的项目，保留原有配置。

SESSION_SECRET 用于稳定 cookie 签名密钥；项目会把会话保存在内存，应用重启后仍需重新登录。`.env` 默认被 Git 和 Docker 构建上下文忽略。

覆盖文件只显式传递上述两个变量；`.env` 里的其他变量不会因此全部传入容器。如果需要 HOST_OVERRIDE、TRUENAS_API_KEY 等设置，在 `compose.cn.yaml` 的 environment 下逐项添加。

## 3. 构建并启动

在项目根目录执行：

```sh
docker compose -f docker-compose.yml -f compose.cn.yaml config --quiet
docker compose -f docker-compose.yml -f compose.cn.yaml up -d --build
```

第一条验证 Compose 合并和环境变量配置；第二条用当前源码构建镜像并启动容器。首次构建需要联网下载基础镜像、系统软件包和 npm 依赖。后续构建可以复用未变化的缓存层。

浏览器访问：

```text
http://服务器IP:4999
```

在右上角切换 English / 简体中文。数据默认保存在项目目录下的 `portracker-data/`，容器里的数据库为 `/data/portracker.db`。

检查服务状态和日志：

```sh
docker compose -f docker-compose.yml -f compose.cn.yaml ps
docker compose -f docker-compose.yml -f compose.cn.yaml logs --tail=100 -f portracker
```

## 4. 更新汉化版

先按[汉化维护文档的完整流程](LOCALIZATION.md#上游更新后的完整流程)合并上游、补齐翻译、通过检查，并提交推送到自己的 `main`。升级前按下文备份现有数据。

**使用部署包时**，在维护机器的仓库根目录运行：

~~~sh
npm run package:docker
~~~

把 `deploy/app` 的完整内容（包含 `.dockerignore`、`.portracker-package.json` 等隐藏文件）同步到服务器原部署目录，保留服务器已有的 `.env`、`portracker-data/` 和自行添加的非生成文件。打包清单负责清理当前机器输出目录中的过期源码；上传到另一台机器时，也要根据新旧清单同步移除远端过期的生成文件，普通的覆盖复制不会自动删除它们。

在服务器的部署包目录中执行：

~~~sh
docker compose -f docker-compose.yaml config --quiet
docker compose -f docker-compose.yaml up -d --build
docker compose -f docker-compose.yaml ps
docker compose -f docker-compose.yaml logs --tail=100 portracker
~~~

显式指定 `docker-compose.yaml` 可以避免服务器残留的旧 `compose.yaml` 或 `compose.override.yaml` 被自动选中。

**直接从完整源码部署时**，在服务器的源码目录同步自己的仓库，再使用原来的两层配置：

~~~sh
git pull --ff-only origin main
docker compose -f docker-compose.yml -f compose.cn.yaml config --quiet
docker compose -f docker-compose.yml -f compose.cn.yaml up -d --build
docker compose -f docker-compose.yml -f compose.cn.yaml ps
docker compose -f docker-compose.yml -f compose.cn.yaml logs --tail=100 portracker
~~~

部署覆盖文件将 `pull_policy` 设置为 build，因此应用镜像从源码构建。汉化更新需要重新构建镜像。启动后确认服务健康，并切换 English / 简体中文检查本轮新增功能。

完整源码部署停止服务可使用（部署包改用 `-f docker-compose.yaml`）：

```sh
docker compose -f docker-compose.yml -f compose.cn.yaml down
```

继续使用同一个 `portracker-data` 目录即可复用数据库。升级前备份数据；对 SQLite 数据目录做文件备份时，先停止服务，备份后再启动。

已有官方版本时，先使用原来的 Compose 配置停止原容器，并备份数据。新部署应挂载原来的数据目录；跨目录迁移时修改原配置中的数据挂载或在覆盖文件中用相同的 /data 容器路径覆盖它。两套配置都使用容器名 portracker，不能同时占用这个名称。

## 5. 部署验证范围

当前工作环境的 PATH 中没有 Docker CLI，因此这里只完成了配置文件的 YAML 语法和关键字段检查，没有执行真实镜像构建或容器启动。部署机器上的 Compose 配置验证、构建、健康状态和日志才是实际部署结果。

参考：

- [Docker Compose 文件合并](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/)
- [Compose 构建规范](https://docs.docker.com/reference/compose-file/build/)
- [服务 `pull_policy`](https://docs.docker.com/reference/compose-file/services/#`pull_policy`)
