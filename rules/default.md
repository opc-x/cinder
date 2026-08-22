# 默认规则

规则文件是给人读的：上面写为什么，下面的 `json` 块给引擎读。
一个文件可以放多个块，每块是一条规则或一个规则数组。
改完这里，跑一次抓取（首页右上角「抓取」按钮）分数就会重算。

字段说明：

- `all` 全部条件命中才算命中，`any` 命中一条即可，两个都写则都要满足
- `field`：`title` / `description` / `tags` / `durationSec` / `source`
- `op`：`regex` / `contains` / `eq` / `gt` / `lt`
- `score` 加减分，`exclude: true` 直接从库里剔掉（优先于分数）

## 画质优先

清晰度是第一位的，4K / 1080p 直接顶上去。

```json
[
  {
    "id": "quality-4k",
    "label": "4K",
    "score": 30,
    "any": [
      { "field": "title", "op": "regex", "value": "4K|2160p" },
      { "field": "tags", "op": "regex", "value": "4K|2160p" }
    ]
  },
  {
    "id": "quality-1080p",
    "label": "1080p",
    "score": 15,
    "any": [{ "field": "tags", "op": "regex", "value": "1080p|fullhd" }]
  }
]
```

## 时长

太短的多半是预告或切片，压下去；正片长度加分。

```json
[
  {
    "id": "duration-too-short",
    "label": "不足 3 分钟",
    "score": -20,
    "all": [{ "field": "durationSec", "op": "lt", "value": 180 }]
  },
  {
    "id": "duration-feature-length",
    "label": "10 分钟以上",
    "score": 10,
    "all": [{ "field": "durationSec", "op": "gt", "value": 600 }]
  }
]
```

## 硬过滤

命中就不进库，不是扣分。

```json
{
  "id": "block-trailer",
  "label": "预告片",
  "exclude": true,
  "any": [{ "field": "tags", "op": "contains", "value": "预告" }]
}
```
