class CategoryResolver:
    """
    entity/item name -> item_like[name].subgroup -> item-subgroup[subgroup].group -> item-group[group]
    Общий резолвер категорий для сущностей и рецептов — обе сущности
    дерева игры (постройки и рецепты) визуально группируются по одной
    и той же системе item-group/item-subgroup.
    """

    def __init__(self, raw: dict, locale_map: dict[str, str] | None = None):
        self.locale_map = locale_map or {}
        self.by_place_result: dict[str, dict] = {}
        self.item_like: dict[str, dict] = {}

        for section_name, section in raw.items():
            if not isinstance(section, dict):
                continue
            for name, proto in section.items():
                if not isinstance(proto, dict):
                    continue
                if "subgroup" not in proto:
                    continue

                place_result = proto.get("place_result")
                if place_result:
                    self.by_place_result.setdefault(place_result, proto)

                self.item_like.setdefault(name, proto)

        self.subgroups = raw.get("item-subgroup", {})
        self.groups = raw.get("item-group", {})

    def resolve(self, name: str) -> dict:
        item = self.by_place_result.get(name) or self.item_like.get(name)

        if not item:
            return {
                "name": "Прочее",
                "groupId": "other",
                "groupOrder": "zzz",
                "subgroup": "other",
                "subgroupOrder": "zzz",
                "itemOrder": name,
                "icon_filename": None,
            }

        subgroup_name = item.get("subgroup")
        subgroup = self.subgroups.get(subgroup_name) if subgroup_name else None
        group_name = subgroup.get("group") if subgroup else None
        group = self.groups.get(group_name) if group_name else None

        if not group:
            return {
                "name": "Прочее",
                "groupId": group_name or "other",
                "groupOrder": "zzz",
                "subgroup": subgroup_name or "other",
                "subgroupOrder": "zzz",
                "itemOrder": item.get("order", name),
                "icon_filename": None,
            }

        icon_filename = None
        icon_path = group.get("icon")
        if icon_path:
            icon_filename = icon_path.rsplit("/", 1)[-1]

        display_name = self.locale_map.get(group_name, group_name)

        return {
            "name": display_name,
            "groupId": group_name,
            "groupOrder": group.get("order", "zzz"),
            "subgroup": subgroup_name,
            "subgroupOrder": subgroup.get("order", "zzz") if subgroup else "zzz",
            "itemOrder": item.get("order", name),
            "icon_filename": icon_filename,
        }