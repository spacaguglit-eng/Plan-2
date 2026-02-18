"""Нормативы плановых остановок: загрузка/сохранение и окно настроек."""
import json
from pathlib import Path

import customtkinter as ctk

# Константы отступов (совпадают с main.py для единого стиля)
PAD = 24
PAD_SM = 12

# Все категории для таблицы нормативов (порядок должен совпадать с DOWNTIME_NORMALIZE_PATTERNS в main)
ALL_CATEGORIES = [
    "СИП 1",
    "СИП 2",
    "СИП 3",
    "Смена этикетки",
    "Смена ЧЗ",
    "Смена пленки",
    "Переналадка",
    "Вытеснение",
    "Запуск",
    "Лаборатория",
    "Мойка",
    "Окончание розлива",
    "Ополаскивание",
    "Остановка розлива",
    "Смена ассортимента",
    "Смена партии",
    "Подача продукта",
    "Подготовка купажа",
]

_SIP_KEY_TO_CATEGORY = {"1": "СИП 1", "2": "СИП 2", "3": "СИП 3"}


def load_line_norms(config_path: Path, line_numbers: tuple) -> dict:
    """Нормативы по линиям и категориям: { \"1\": {\"СИП 1\": int, ...}, ... }."""
    raw = {}
    try:
        if config_path.exists():
            raw = json.loads(config_path.read_text(encoding="utf-8")).get("line_norms", {})
    except Exception:
        pass
    out = {}
    for line_num in line_numbers:
        key = str(line_num)
        out[key] = {}
        for cat in ALL_CATEGORIES:
            default = 30 if cat in ("СИП 1", "СИП 2", "СИП 3") else 0
            out[key][cat] = default
        if key in raw and isinstance(raw[key], dict):
            stored = raw[key]
            for cat in ALL_CATEGORIES:
                if cat in stored:
                    try:
                        out[key][cat] = int(stored[cat])
                    except (TypeError, ValueError):
                        pass
            for sip_key, cat_name in _SIP_KEY_TO_CATEGORY.items():
                if sip_key in stored and cat_name in ALL_CATEGORIES:
                    try:
                        out[key][cat_name] = int(stored[sip_key])
                    except (TypeError, ValueError):
                        pass
    return out


def save_line_norms(line_norms: dict, config_path: Path) -> None:
    data = {}
    try:
        if config_path.exists():
            data = json.loads(config_path.read_text(encoding="utf-8"))
    except Exception:
        pass
    data["line_norms"] = line_norms
    try:
        config_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def open_norms_window(
    app: ctk.CTk,
    *,
    config_path: Path,
    line_numbers: tuple,
    log,
) -> None:
    """Открывает окно нормативов. Зависимости передаются из main."""
    try:
        win = ctk.CTkToplevel(app)
    except Exception as e:
        log.exception("Ошибка открытия окна нормативов: %s", e)
        return
    try:
        win.wm_transient(app)
    except Exception:
        pass
    win.title("Нормативы плановых остановок")
    win.geometry("960x580")
    win.minsize(640, 480)
    fr = ctk.CTkFrame(win, fg_color="transparent")
    fr.pack(fill="both", expand=True, padx=PAD, pady=PAD)

    # Нормативы по линиям: выбор линии + список категорий с выбором нормы (мин)
    line_norms_edited = load_line_norms(config_path, line_numbers)
    NORM_CHOICES = ["0", "10", "15", "20", "25", "30", "40", "45", "60", "90", "120", "150", "180", "200", "240", "250", "270", "300", "360", "420", "480", "540", "600", "720"]
    current_line_var = ctk.StringVar(value=str(line_numbers[0]) if line_numbers else "1")
    category_vars = {}  # cat -> StringVar

    ctk.CTkLabel(fr, text="Нормативы по линиям и категориям (мин)", font=ctk.CTkFont(weight="bold")).pack(anchor="w", pady=(0, PAD_SM))
    line_row = ctk.CTkFrame(fr, fg_color="transparent")
    line_row.pack(fill="x", pady=(0, PAD_SM))
    ctk.CTkLabel(line_row, text="Линия:", width=80).pack(side="left", padx=(0, PAD_SM))
    line_option = ctk.CTkOptionMenu(line_row, values=[str(n) for n in line_numbers], variable=current_line_var, width=120)

    last_loaded_line = [str(line_numbers[0]) if line_numbers else "1"]

    def _save_line_to_memory(key: str):
        if not key or key not in line_norms_edited:
            return
        for cat in ALL_CATEGORIES:
            if cat not in category_vars:
                continue
            try:
                line_norms_edited[key][cat] = int(category_vars[cat].get() or 0)
            except (ValueError, TypeError):
                line_norms_edited[key][cat] = 0

    def _load_line_into_ui(key: str):
        for cat in ALL_CATEGORIES:
            if cat not in category_vars:
                continue
            val = line_norms_edited.get(key, {}).get(cat, 0)
            category_vars[cat].set(str(val))

    def on_line_changed(_=None):
        new_line = current_line_var.get()
        _save_line_to_memory(last_loaded_line[0])
        _load_line_into_ui(new_line)
        last_loaded_line[0] = new_line

    line_option.pack(side="left")
    line_option.configure(command=on_line_changed)

    def _choices_with_saved(cat):
        saved = {str(line_norms_edited.get(k, {}).get(cat, 0)) for k in line_norms_edited}
        return sorted(set(NORM_CHOICES) | saved, key=lambda x: int(x) if str(x).isdigit() else 0)

    table_scroll = ctk.CTkScrollableFrame(fr, fg_color="transparent", height=320)
    table_scroll.pack(fill="x", pady=(0, PAD_SM))
    for cat in ALL_CATEGORIES:
        row_fr = ctk.CTkFrame(table_scroll, fg_color="transparent")
        row_fr.pack(fill="x", pady=1)
        ctk.CTkLabel(row_fr, text=cat, width=200, anchor="w").pack(side="left", padx=(0, PAD_SM))
        var = ctk.StringVar(value=str(line_norms_edited.get(current_line_var.get(), {}).get(cat, 0)))
        om = ctk.CTkOptionMenu(row_fr, values=_choices_with_saved(cat), variable=var, width=100)
        om.pack(side="left")
        category_vars[cat] = var
    _load_line_into_ui(current_line_var.get())

    def save_norms():
        try:
            _save_line_to_memory(last_loaded_line[0])
            save_line_norms(line_norms_edited, config_path)
            log.info("Нормативы сохранены.")
        except ValueError:
            pass

    ctk.CTkButton(fr, text="Сохранить нормативы", command=save_norms).pack(anchor="w", pady=(0, PAD_SM))

    win.update_idletasks()
    win.lift()
    try:
        win.focus_force()
    except Exception:
        pass
