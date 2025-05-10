Tapdata MCP 功能教程：金融风控系统集成案例

目录

- [简介](#简介)
- [环境准备](#环境准备)
- [配置步骤](#配置步骤)
- [联系我们](#联系我们)
# 简介

本教程将展示如何利用TapData的MCP（Model-Context-Protocol）功能与Trae AI助手集成，实现AI对金融风控系统数据的智能查询和分析。
通过这个案例，您将了解如何让AI助手直接与TapData交互，提供数据驱动的决策支持。

## 什么是Tapdata MCP？

TapData 是一种强大的数据集成和处理框架，允许AI系统使用MCP协议安全地连接到您的数据源，执行查询和分析操作。
它作为AI与企业数据之间的桥梁，确保数据安全的同时提供灵活的数据访问能力。

## 本教程的价值

- 在自己的环境安装部署TapData
- 使用自己的AI Agent 通过 TapData MCP Server 访问您的业务数据

# 环境准备

- 一台Linux 服务器或者云主机
    - CPU：4核或更高
    - 内存：至少8GB RAM
    - 存储：至少50GB可用空间
    - 操作系统：CentOS 7+、Ubuntu 18.04+或其他支持的Linux发行版
    - 网络：可从开发笔记本访问

- Sample数据源
    - MySQL：
        - URI: jdbc:mysql://58.251.34.123:23306/risk_db
        - User: u_risk
        - Pwd: Risk!234
    - PostgreSQL：
        - URI: jdbc:postgresql://58.251.34.123:25432/risk_db
        - User: u_risk
        - Pwd: Risk!234
        - Schema: public
          软件要求

- 个人电脑
  - 安装 Trae AI
  - 现代网络浏览器（Chrome、Firefox、Edge等）
  - SSH客户端（用于连接云主机）

- Linux服务器/云主机：
  - Docker和Docker Compose

# 配置步骤

## 安装和配置Tapdata

 TapData 提供了 AllInOne 容器，您只需要登录服务器终端，执行下方命令即可启动TapData。
```shell
docker run -d -p 3030:3030 ghcr.io/tapdata/tapdata:latest
```

## 登录 TapData 管理界面

1. 打开浏览器，访问: **http://<云主机IP>:3030**
2. 默认用户：admin@admin.com/admin

## 配置数据源连接

在本教程中，我们将配置三个数据源连接到金融风控系统：

### 数据源准备
1. MySQL 风控数据库：
- 名称：MySQL-Risk
- 包含交易记录、用户行为等基础数据
- 标签：核心系统
- 数据库连接信息（数据为AI生成）：
    - URI: jdbc:mysql://58.251.34.123:23306/risk_db
    - User: u_risk
    - Pwd: Risk!234

2. PostgreSQL 风控数据库：
- 名称：PostgreSQL-Risk
- 包含风险评分、规则配置等数据
- 数据库连接信息（数据由AI 生成）
    - URI: jdbc:postgresql://58.251.34.123:25432/risk_db
    - User: u_risk
    - Pwd: Risk!234
    - Schema: public

3. MongoDB 中台数据库：
- 名称：MongoDB-Risk
- 用于实时数仓，汇总各个源库数据


## 详细安装配置步骤

https://github.com/user-attachments/assets/013628e6-9d2c-4a6a-a8d4-918601e1a99b



<video src="demo.mp4" controls>
  Your browser does not support the video tag.
</video>

# 使用TapData MCP Server 有哪些优势

|           | AI + MySQL/PostgreSQL MCP Server                                        | AI + TapData MCP Server                                                          |
|-----------|-------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| 数据安全      | 直接暴露源库数据给AI，增加敏感数据泄露风险                                                  | TapData 在准备数据阶段可以过滤敏感数据，避免泄露风险                                                   |
| 响应时间/查询性能 | Agent 需要执行多次MCP交互才可以获取到需要的数据（关系性数据库表结构设计大都需要满足1NF），在处理复杂问题时需要花费更多时间获取数据 | 能够根据业务需要，将数据实时同步到物化视图，Agent在处理复杂任务时只需要一次MCP交互，即可获取到所有想要的数据，减少了获取数据的时间            |
| 数据源种类支持   | 需要查找源库对应的MCP Server，多个种类需要添加多个MCP Server                                | 支持多种类型的数据源，只需要添加一个MCP Server 即可访问来至不同种类源库的数据；可实时将来自不同种类数据源的数据关联到一起做成物化视图给Agent使用 |

# 联系我们

- Email: [Send Email](mailto:leon@tapdata.io)
- Phone: 18661673206
- WeChat:
<img src="qr_code.jpeg">