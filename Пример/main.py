"""Отчёт по линиям — чтение и анализ Excel."""
import json
import logging
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from queue import Queue

import customtkinter as ctk
from tkinter import filedialog

from excel_reader import find_line_files, read_line_non_empty_days, build_consolidated_day_excel, DowntimeEntry
from norms import open_norms_window as _open_norms_window, load_line_norms

# В exe — папка с exe; при запуске из скрипта — папка с main.py
APP_DIR = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent


def _parse_time_to_minutes(val) -> int | None:
    """Время из ячейки (строка/число Excel) в минуты от полуночи. Если в ячейке дата+время — учитывается только время."""
    if val is None:
        return None
    # Объект datetime: берём только время (отсекаем дату)
    if hasattr(val, "hour") and hasattr(val, "minute"):
        h, m = getattr(val, "hour", 0), getattr(val, "minute", 0)
        sec = getattr(val, "second", 0)
        return h * 60 + m + (sec // 30)  # округление секунд
    if isinstance(val, (int, float)):
        # Excel: число >= 1 это дата+время (дни с 1900-01-01), дробная часть — время суток
        if val >= 1:
            val = val % 1
        return int(round(val * 24 * 60))
    s = str(val).strip()
    if not s:
        return None
    # Строка вида "01.01.1900 0:05:00" или "1900-01-01 00:05:00": оставляем только время
    if " " in s:
        parts = s.split()
        for p in reversed(parts):
            if ":" in p:
                s = p
                break
    for sep in (":", ".", ","):
        if sep in s and sep != ".":
            parts = s.replace(",", ".").split(":" if sep == ":" else sep)
            if len(parts) >= 2:
                try:
                    h, m = int(float(parts[0])), int(float(parts[1])) if len(parts) > 1 else 0
                    return h * 60 + m
                except (ValueError, IndexError):
                    pass
    try:
        f = float(s.replace(",", "."))
        if 0 <= f < 1:
            return int(round(f * 24 * 60))
        if f >= 1:
            f = f % 1
        return int(round(f * 24 * 60))
    except ValueError:
        return None


def _normalize_kind(s: str) -> str:
    """Нормализация вида для сопоставления: CIP/СИП 1/2/3 в любом написании."""
    if not s:
        return ""
    t = re.sub(r"\s+", " ", (s or "").strip().lower())
    t = t.replace("сип", "cip").replace("сіп", "cip")
    return t.strip()


def _is_cip_sip_kind(kind: str) -> bool:
    """Похоже на CIP/СИП 1, 2 или 3 в любом написании (cip1, cip 1, №1 и т.д.)."""
    n = _normalize_kind(kind)
    if not n or "cip" not in n:
        return False
    # cip + 1/2/3: с пробелом, без, или №
    return bool(re.search(r"cip\s*[№n]?\s*[123]\b", n)) or bool(re.search(r"cip[123]\b", n)) or n in ("cip1", "cip2", "cip3")


# Нормализация описаний остановок: (нормальное имя, список скомпилированных регексов)
# Порядок важен: более частные варианты выше.
_RAW_PATTERNS = [
    ("СИП 1", [r"сип\s*1\b", r"сип1\b"]),
    ("СИП 2", [r"сип\s*2\b", r"сип2\b"]),
    ("СИП 3", [r"сип\s*3\b", r"сип3\b"]),
    ("Смена этикетки", [r"этик[её]тк", r"етикетк", r"этиккетк", r"этиктетк", r"этик[её]т[её]к", r"смена\s+этик", r"этикетк"]),
    ("Смена ЧЗ", [r"смена\s*ч\s*з", r"смена\s*чз", r"чз\s*\(общ", r"ч\.?\s*з\s*\(общ", r"настройк\w*\s*ч\s*з", r"настройк\w*\s*чз", r"\bчз\b", r"\bч\s*з\b"]),
    ("Смена пленки", [r"пленк[иа]?", r"пл[её]нк", r"смена\s+пленк", r"пленка"]),
    ("Переналадка", [r"переналадк", r"переналад", r"переналадка"]),
    ("Вытеснение", [r"вытеснен", r"втеснен", r"втеснение", r"вытесн\w*в\s+банан"]),
    ("Запуск", [r"запуск\s+линии", r"запуск\s+продукт", r"плановый\s+запуск", r"запуск\b"]),
    ("Лаборатория", [r"лаборатор"]),
    ("Мойка", [r"мойк[аи]\s+", r"мойк[аи]$", r"мойк\s+фильтр", r"мойк\s+купаж", r"м[оа]йк\w*фильтр", r"промывк[аи]\s+фильтр"]),
    ("Окончание розлива", [r"окончание\s+розлив", r"окнчание\s+розлив", r"окончание\s+программ", r"окнчание\s+программ"]),
    ("Ополаскивание", [r"опласкиван", r"ополаскиван"]),
    ("Остановка розлива", [r"остановк\w*\s+розлив", r"остоновк"]),
    ("Смена ассортимента", [r"смена\s+ассортимент", r"смена\s+т\.?\s*м\.?", r"переход\s+на\s+другой\s+продукт", r"переход\s+на\s+тм", r"переход\s+на\s+энергетик"]),
    ("Смена партии", [r"смена\s+партии", r"смена\s+дат\w*"]),
    ("Подача продукта", [r"подач[аи]\s+продукт", r"ожидание\s+продукт"]),
    ("Подготовка купажа", [r"подг[ао]?товк\w*\s+купаж", r"подг[ао]?товк\w*\s+упаж", r"подготовк\w*\s+купаж", r"подготовк\w*\s+упаж"]),
]

DOWNTIME_NORMALIZE_PATTERNS = [
    (name, [re.compile(p, re.IGNORECASE) for p in patterns])
    for name, patterns in _RAW_PATTERNS
]

def normalize_downtime_description(desc: str) -> str:
    """Возвращает нормализованное название категории остановки по описанию (с учётом опечаток)."""
    if not desc or not str(desc).strip():
        return (desc or "").strip()
    s = re.sub(r"\s+", " ", str(desc).strip().lower())
    for name, patterns in DOWNTIME_NORMALIZE_PATTERNS:
        for pat in patterns:
            if pat.search(s):
                return name
    return s


def _is_planned_downtime(d: DowntimeEntry) -> bool:
    """Простой считается плановым, если в колонке K (тип) или в виде есть «планов»."""
    t = (getattr(d, "type", None) or "").strip()
    k = (d.kind or "").strip()
    # Быстрая проверка без лишней конкатенации
    return "планов" in t.lower() or "планов" in k.lower()


def _category_from_downtime(d: DowntimeEntry) -> str | None:
    """Определяет категорию простоя только по совпадению с DOWNTIME_NORMALIZE_PATTERNS. Возвращает None, если ни один регекс не подошёл."""
    text = (d.description or d.kind or "").strip()
    if not text:
        return None
    s = re.sub(r"\s+", " ", text.lower())
    for name, patterns in DOWNTIME_NORMALIZE_PATTERNS:
        for pat in patterns:
            if pat.search(s):
                return name
    return None


MINUTES_PER_DAY = 24 * 60  # 1440


def _duration_minutes(start_m: int | None, end_m: int | None) -> int | None:
    """Длительность в минутах. При переходе через полночь (end < start) считаем интервал на следующие сутки."""
    if start_m is None or end_m is None:
        return None
    if end_m >= start_m:
        return end_m - start_m
    return (MINUTES_PER_DAY - start_m) + end_m


def _downtime_duration_min(d: DowntimeEntry) -> int | None:
    start_m = _parse_time_to_minutes(d.start) if d.start else None
    end_m = _parse_time_to_minutes(d.end) if d.end else None
    return _duration_minutes(start_m, end_m)


def _merge_adjacent_same_category_downtimes(downtimes: list[DowntimeEntry]) -> list[DowntimeEntry]:
    """Объединяет подряд идущие простои одной категории с соприкасающимися интервалами (конец одного = начало следующего).
    Устраняет задвоение при переходе события через границу смены (например СИП 3: 17:30–20:00 и 20:00–22:30 → одна запись 17:30–22:30)."""
    if not downtimes:
        return []
    # Только плановые с определённой категорией и парсируемым временем
    with_cat = []
    for d in downtimes:
        if not _is_planned_downtime(d):
            with_cat.append((d, None, None, None))
            continue
        cat = _category_from_downtime(d)
        start_m = _parse_time_to_minutes(d.start) if d.start else None
        end_m = _parse_time_to_minutes(d.end) if d.end else None
        with_cat.append((d, cat, start_m, end_m))
    # Сортируем по началу времени (записи без времени в конец)
    def sort_key(item):
        _d, _c, sm, _em = item
        return (sm is None, sm if sm is not None else 0)

    with_cat.sort(key=sort_key)
    merged: list[DowntimeEntry] = []
    i = 0
    while i < len(with_cat):
        d, cat, start_m, end_m = with_cat[i]
        if not _is_planned_downtime(d) or cat is None or start_m is None or end_m is None:
            merged.append(d)
            i += 1
            continue
        # Сливаем все следующие записи той же категории с соприкасающимся интервалом
        current = d
        curr_end_m = end_m
        j = i + 1
        while j < len(with_cat):
            d_next, cat_next, next_start_m, next_end_m = with_cat[j]
            if not _is_planned_downtime(d_next) or cat_next != cat or next_start_m is None or next_end_m is None:
                break
            if next_start_m != curr_end_m:
                break
            current = DowntimeEntry(
                product=current.product,
                description=current.description,
                kind=current.kind,
                start=current.start,
                end=d_next.end,
                type=current.type,
            )
            curr_end_m = next_end_m
            j += 1
        merged.append(current)
        i = j
    return merged


def _get_unplanned_long_downtimes(lines_result, min_minutes: int = 30) -> list[tuple[int, int, DowntimeEntry, int]]:
    """Неплановые простои длительностью более min_minutes. Возвращает [(line_num, day, downtime_entry, duration_min), ...]."""
    out = []
    for line_num, _name, day_infos in lines_result:
        for info in day_infos:
            for d in info.downtimes:
                if _is_planned_downtime(d):
                    continue
                duration = _downtime_duration_min(d)
                if duration is None or duration < min_minutes:
                    continue
                out.append((line_num, info.day, d, duration))
    return out


def _compare_downtimes_to_norms(lines_result, line_norms) -> tuple[list[str], list[str]]:
    """Плановые простои — парсим категорию и сравниваем с нормой. Остальные — только записываем в список."""
    comparison = []
    other = []
    for line_num, _name, day_infos in lines_result:
        line_key = str(line_num)
        norms_for_line = line_norms.get(line_key, {})
        for info in day_infos:
            for d in _merge_adjacent_same_category_downtimes(info.downtimes):
                desc_display = (d.description or d.kind or "—").strip() or "—"
                dtype = getattr(d, "type", "") or ""
                if not _is_planned_downtime(d):
                    continue
                cat = _category_from_downtime(d)
                if cat is None:
                    other.append(
                        f"    Линия {line_num}, день {info.day}: {desc_display} ({d.start or '—'}–{d.end or '—'}) — не распознан (нет совпадения с категориями)"
                    )
                    continue
                norm = norms_for_line.get(cat)
                if norm is None or norm <= 0:
                    other.append(
                        f"    Линия {line_num}, день {info.day}: {cat} ({desc_display}) {d.start or '—'}–{d.end or '—'} — норма не задана"
                    )
                    continue
                duration = _downtime_duration_min(d)
                if duration is None:
                    other.append(
                        f"    Линия {line_num}, день {info.day}: {cat} ({desc_display}) {d.start or '—'}–{d.end or '—'} — не удалось посчитать длительность"
                    )
                    continue
                time_range = f" {d.start or '—'}–{d.end or '—'}"
                if duration > norm:
                    comparison.append(
                        f"    Линия {line_num}, день {info.day}: {cat}{time_range} — факт {duration} мин, норма {norm} мин [превышение {duration - norm} мин]"
                    )
                else:
                    comparison.append(
                        f"    Линия {line_num}, день {info.day}: {cat}{time_range} — факт {duration} мин, норма {norm} мин — в норме"
                    )
    return (comparison, other)


def _parse_speed(val) -> float | None:
    """Скорость из ячейки (строка/число)."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _int_str(value: int | float | None) -> str:
    return str(int(round(value))) if value is not None else "-"


def _fmt_debug_cell(val, max_len: int = 36) -> str:
    """Для отладочных таблиц: число — коротко, строка — обрезка по max_len."""
    if val is None or val == "":
        return "—"
    if isinstance(val, (int, float)):
        if isinstance(val, float) and (abs(val - round(val)) < 1e-6 or val == int(val)):
            return str(int(round(val)))
        if isinstance(val, float):
            return f"{val:.2f}" if abs(val) < 1e6 else str(int(round(val)))
        return str(val)
    s = str(val).strip()
    return (s[: max_len - 2] + "…") if len(s) > max_len else s


def _pad_col(s: str, width: int) -> str:
    """Обрезает или дополняет пробелами до width для выравнивания колонки."""
    s = s[:width] if len(s) > width else s
    return s.ljust(width)


def _minutes_to_time(minutes: int | None) -> str:
    """Минуты от полуночи → строка ЧЧ:ММ."""
    if minutes is None:
        return "—"
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"


def _get_plan_fact_map(lines_result, line_norms) -> dict[tuple[int, int], tuple[int, int]]:
    """Возвращает {(line_num, day): (plan_int, fact_int)} для дней с рассчитанным планом."""
    result = {}
    for line_num, _name, day_infos in lines_result:
        line_key = str(line_num)
        norms_for_line = line_norms.get(line_key, {})
        for info in day_infos:
            if not info.has_data or not info.details:
                continue
            durations = []
            for d in info.details:
                start_m = _parse_time_to_minutes(d.start)
                end_m = _parse_time_to_minutes(d.end)
                dur = _duration_minutes(start_m, end_m)
                if dur is not None and dur > 0:
                    durations.append(dur)
            work_time_min = sum(durations) if durations else None
            if work_time_min is None or work_time_min <= 0:
                continue
            sum_speed_dur = 0.0
            sum_dur = 0
            for d in info.details:
                start_m = _parse_time_to_minutes(d.start)
                end_m = _parse_time_to_minutes(d.end)
                speed = _parse_speed(d.speed)
                dur = _duration_minutes(start_m, end_m)
                if dur is None or dur <= 0 or speed is None:
                    continue
                sum_speed_dur += speed * dur
                sum_dur += dur
            avg_speed = (sum_speed_dur / sum_dur) if sum_dur > 0 else None
            if avg_speed is None:
                continue
            norms_sum = 0
            for d in _merge_adjacent_same_category_downtimes(info.downtimes):
                if not _is_planned_downtime(d):
                    continue
                cat = _category_from_downtime(d)
                if cat is None:
                    continue
                n = norms_for_line.get(cat)
                if n is not None and n > 0:
                    if cat in ("СИП 1", "СИП 2", "СИП 3"):
                        norms_sum += n
                    else:
                        duration = _downtime_duration_min(d)
                        norms_sum += min(duration, n) if duration is not None else n
            available_min = max(0, work_time_min - norms_sum)
            plan_int = int(round(avg_speed * (available_min / 60.0) * (10 / 12)))
            fact_int = int(round(sum((_parse_speed(getattr(d, "fact", None)) or 0) for d in info.details)))
            result[(line_num, info.day)] = (plan_int, fact_int)
    return result


def _compute_plan(lines_result, line_norms, detailed: bool = False) -> list[str]:
    """План по линиям и дням. detailed=True — отладочный вывод по каждому дню."""
    out = []
    for line_num, _name, day_infos in lines_result:
        line_key = str(line_num)
        norms_for_line = line_norms.get(line_key, {})
        for info in day_infos:
            if not info.has_data or not info.details:
                continue
            if detailed:
                out.append("")
                out.append(f"========== Линия {line_num}, день {info.day} ==========")
                out.append("  Данные A (value | start | end | speed | start_мин | end_мин | длит_мин | скорость_число):")
                w_val, w_t, w_n = 40, 12, 8
                for d in info.details:
                    start_m = _parse_time_to_minutes(d.start)
                    end_m = _parse_time_to_minutes(d.end)
                    speed_f = _parse_speed(d.speed)
                    dur = _duration_minutes(start_m, end_m)
                    v = _fmt_debug_cell(d.value, w_val)
                    out.append(
                        f"    {_pad_col(v, w_val)} | {_pad_col(str(d.start or '-'), w_t)} | {_pad_col(str(d.end or '-'), w_t)} | "
                        f"{_pad_col(str(d.speed) if d.speed is not None else '-', w_n)} | {_pad_col(_int_str(start_m), 6)} | "
                        f"{_pad_col(_int_str(end_m), 6)} | {_pad_col(_int_str(dur), 6)} | {_fmt_debug_cell(speed_f, w_n)}"
                    )
                out.append("  Простои (время начало–конец | длительность | категория | описание | норма мин):")
                w_time, w_dur, w_cat, w_desc, w_norm = 18, 14, 22, 42, 10
                for d in _merge_adjacent_same_category_downtimes(info.downtimes):
                    planned = _is_planned_downtime(d)
                    start_m = _parse_time_to_minutes(d.start)
                    end_m = _parse_time_to_minutes(d.end)
                    time_range = f"{_minutes_to_time(start_m)}–{_minutes_to_time(end_m)}"
                    duration_min = _downtime_duration_min(d)
                    dur_str = f"{duration_min} мин" if duration_min is not None else "—"
                    cat = _category_from_downtime(d) if planned else None
                    n = norms_for_line.get(cat) if cat else None
                    n_str = str(n) if n is not None and n > 0 else ("—" if cat else ("—" if not planned else "не распознан"))
                    desc = (d.description or d.kind or "—").strip() or "—"
                    out.append(
                        f"    {_pad_col(time_range, w_time)} | {_pad_col(dur_str, w_dur)} | "
                        f"{_pad_col(cat or "—", w_cat)} | {_pad_col(_fmt_debug_cell(desc, w_desc), w_desc)} | {_pad_col(n_str, w_norm)}"
                    )

            durations = []
            for d in info.details:
                start_m = _parse_time_to_minutes(d.start)
                end_m = _parse_time_to_minutes(d.end)
                dur = _duration_minutes(start_m, end_m)
                if dur is not None and dur > 0:
                    durations.append(dur)
            work_time_min = sum(durations) if durations else None
            if detailed:
                out.append(f"  Время работы: сумма длительностей интервалов {durations} = {work_time_min} мин")

            if work_time_min is None or work_time_min <= 0:
                out.append(f"Линия {line_num}, день {info.day}: нет данных по времени работы")
                continue

            sum_speed_dur = 0.0
            sum_dur = 0
            if detailed:
                out.append("  Средняя скорость (интервалы start_мин–end_мин, длит_мин, скорость, вклад speed*dur):")
            for d in info.details:
                start_m = _parse_time_to_minutes(d.start)
                end_m = _parse_time_to_minutes(d.end)
                speed = _parse_speed(d.speed)
                dur = _duration_minutes(start_m, end_m)
                if dur is None or dur <= 0 or speed is None:
                    continue
                sum_speed_dur += speed * dur
                sum_dur += dur
                if detailed:
                    out.append(
                        f"    {_int_str(start_m)}–{_int_str(end_m)}, dur={_int_str(dur)}, speed={speed} → вклад {speed * dur:.1f}"
                    )
            avg_speed = (sum_speed_dur / sum_dur) if sum_dur > 0 else None
            if detailed:
                out.append(f"  sum_speed_dur={sum_speed_dur:.1f}, sum_dur={sum_dur} → avg_speed={avg_speed}")

            if avg_speed is None:
                out.append(f"Линия {line_num}, день {info.day}: не удалось посчитать среднюю скорость")
                continue

            norms_sum = 0
            for d in _merge_adjacent_same_category_downtimes(info.downtimes):
                if not _is_planned_downtime(d):
                    continue
                cat = _category_from_downtime(d)
                if cat is None:
                    continue
                n = norms_for_line.get(cat)
                if n is not None and n > 0:
                    if cat in ("СИП 1", "СИП 2", "СИП 3"):
                        norms_sum += n
                    else:
                        duration = _downtime_duration_min(d)
                        norms_sum += min(duration, n) if duration is not None else n
            available_min = max(0, work_time_min - norms_sum)
            plan = avg_speed * (available_min / 60.0) * (10 / 12)
            plan_int = int(round(plan))
            # Факт — сумма значений из столбца K по всем строкам дня
            fact_sum = sum((_parse_speed(getattr(d, "fact", None)) or 0) for d in info.details)
            fact_int = int(round(fact_sum))
            deviation = fact_int - plan_int
            dev_str = f", отклонение {deviation:+d}" if plan_int else ""
            if detailed:
                out.append(
                    f"  Норм. простои: {norms_sum} мин. Доступно: {available_min} мин. "
                    f"План = {avg_speed:.1f} * ({available_min}/60) * (10/12) = {plan_int}"
                )
                out.append(f"  Факт (столбец K) = {fact_int}{dev_str}")
            out.append(
                f"Линия {line_num}, день {info.day}: скорость {avg_speed:.1f} шт/ч, время {work_time_min} мин, "
                f"норм. простои {norms_sum} мин, доступно {available_min} мин → план = {plan_int}, факт = {fact_int}{dev_str}"
            )
            shortfall = max(0, plan_int - fact_int)
            if shortfall > 0:
                total_downtime_min = sum(
                    x for d in info.downtimes
                    for x in (_downtime_duration_min(d),)
                    if x is not None
                )
                # В аналитику: превышение нормативных плановых (факт − норма по каждому) + все остальные категории; переходящие СИПы учтены как одно событие
                excess_downtime_min = 0
                for d in _merge_adjacent_same_category_downtimes(info.downtimes):
                    duration = _downtime_duration_min(d)
                    if duration is None:
                        continue
                    if _is_planned_downtime(d):
                        cat = _category_from_downtime(d)
                        norm = norms_for_line.get(cat) if cat else None
                        if cat and norm is not None and norm > 0:
                            excess_downtime_min += max(0, duration - norm)
                        else:
                            excess_downtime_min += duration
                    else:
                        excess_downtime_min += duration
                lost_from_downtimes = avg_speed * (excess_downtime_min / 60.0)
                lost_int = int(round(lost_from_downtimes))
                if lost_int >= shortfall:
                    cover_str = "простои покрывают невыполнение"
                elif lost_int > 0:
                    pct = int(round(100 * lost_int / shortfall))
                    cover_str = f"частично покрывают ({pct}%)"
                else:
                    cover_str = "не покрывают невыполнение"
                analytics_line = (
                    f"  Аналитика: невыполнение плана {shortfall} шт., простои всего {total_downtime_min} мин "
                    f"(в аналитике: превышение норм + остальные категории = {excess_downtime_min} мин), потери {lost_int} шт. — {cover_str}."
                )
                out.append(analytics_line)
    return out


CONFIG_PATH = APP_DIR / "config.json"


def _ensure_config_from_bundle():
    """При первом запуске exe: скопировать вшитый config.json рядом с программой."""
    if not getattr(sys, "frozen", False):
        return
    bundle_dir = Path(sys._MEIPASS)
    bundled = bundle_dir / "config.json"
    if not CONFIG_PATH.exists() and bundled.exists():
        try:
            import shutil
            shutil.copy2(bundled, CONFIG_PATH)
        except Exception:
            pass


def load_config() -> dict:
    _ensure_config_from_bundle()
    try:
        if CONFIG_PATH.exists():
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def save_config(updates: dict):
    try:
        data = load_config()
        data.update(updates)
        CONFIG_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def load_saved_folder() -> str:
    data = load_config()
    return data.get("folder", "") or r"\\phnas\share\CОКИ И НЕКТАРЫ\Отчеты производства\Февраль"


def load_email_show_reasons() -> bool:
    data = load_config()
    return data.get("email_show_reasons", True)


def save_folder(folder: str):
    save_config({"folder": folder})


class QueueLogHandler(logging.Handler):
    """Отправляет записи лога в очередь для вывода в GUI."""
    def __init__(self, queue: Queue):
        super().__init__()
        self.queue = queue

    def emit(self, record):
        try:
            msg = self.format(record)
            self.queue.put({"type": "log", "text": msg})
        except Exception:
            self.handleError(record)

ctk.set_appearance_mode("light")
ctk.set_default_color_theme("blue")

# Константы оформления (единый стиль главного окна и диалогов)
PAD = 24
PAD_SM = 12
SECTION_GAP = 20

app = ctk.CTk()
app.title("Отчёт по линиям — 6 блоков (шаблон)")
app.geometry("720x560")
app.minsize(520, 480)

FONT_HEADING = ctk.CTkFont(size=18, weight="bold")
FONT_SECTION = ctk.CTkFont(size=14, weight="bold")
FONT_BODY = ctk.CTkFont(size=12)
FONT_MONO = ctk.CTkFont(family="Consolas", size=12)

# Монолитный блок: одна карточка на всё главное окно
main_card = ctk.CTkFrame(app, fg_color=("gray92", "gray18"), corner_radius=12)
main_card.pack(fill="both", expand=True, padx=PAD, pady=PAD)

main = ctk.CTkFrame(main_card, fg_color="transparent")
main.pack(fill="both", expand=True, padx=PAD, pady=PAD)

# --- Секция «Параметры» ---
section_params = ctk.CTkFrame(main, fg_color="transparent")
section_params.pack(fill="x", pady=(0, SECTION_GAP))

title = ctk.CTkLabel(section_params, text="Сформировать отчёт за день", font=FONT_HEADING)
title.pack(pady=(0, SECTION_GAP))

row = ctk.CTkFrame(section_params, fg_color="transparent")
row.pack(fill="x", pady=(0, PAD_SM))

lbl = ctk.CTkLabel(row, text="Файлы берём из папки:", font=FONT_BODY)
lbl.pack(side="left", padx=(0, PAD_SM))
path_var = ctk.StringVar(value=load_saved_folder())
path_entry = ctk.CTkEntry(row, textvariable=path_var, placeholder_text="Путь к папке...", font=FONT_BODY)
path_entry.pack(side="left", fill="x", expand=True, padx=(0, PAD_SM))

day_row = ctk.CTkFrame(section_params, fg_color="transparent")
day_row.pack(fill="x", pady=(0, PAD_SM))
_default_day = (datetime.now() - timedelta(days=1)).day
ctk.CTkLabel(day_row, text="День отчёта:", font=FONT_BODY).pack(side="left", padx=(0, PAD_SM))
day_var = ctk.StringVar(value=str(_default_day))
day_option = ctk.CTkOptionMenu(day_row, values=["Все"] + [str(d) for d in range(1, 32)], variable=day_var, width=80, font=FONT_BODY)
day_option.pack(side="left")

email_show_reasons_var = ctk.BooleanVar(value=load_email_show_reasons())
switch_row = ctk.CTkFrame(section_params, fg_color="transparent")
switch_row.pack(fill="x", pady=(0, PAD_SM))
ctk.CTkSwitch(
    switch_row,
    text="Включать причины простоев в текст для копирования",
    variable=email_show_reasons_var,
    font=FONT_BODY,
).pack(side="left")


def _save_email_show_reasons(*args):
    save_config({"email_show_reasons": email_show_reasons_var.get()})


email_show_reasons_var.trace_add("write", _save_email_show_reasons)


def load_downtime_norms() -> dict:
    """Вид простоя -> норма (мин)."""
    data = load_config()
    return data.get("downtime_norms", {})


def save_downtime_norms(norms: dict):
    save_config({"downtime_norms": norms})


def load_sip_norms() -> dict:
    """Нормативы СИП 1, 2, 3 (мин). Ключи "1", "2", "3"."""
    data = load_config()
    raw = data.get("sip_norms", {})
    out = {}
    for k in ("1", "2", "3"):
        if k in raw:
            try:
                out[k] = int(raw[k])
            except (TypeError, ValueError):
                out[k] = 30
        else:
            out[k] = 30
    return out


def save_sip_norms(sip_1: int, sip_2: int, sip_3: int):
    save_config({"sip_norms": {"1": sip_1, "2": sip_2, "3": sip_3}})


LINE_NUMBERS = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12)  # номера линий из файлов

# Результат последнего скана для окна нормативов: list of (line_num, path.name, day_infos)
last_scan_result = []


def choose_folder():
    folder = filedialog.askdirectory(title="Выберите папку с файлами")
    if folder:
        path_var.set(folder)
        save_folder(folder)
        log.info("Выбрана папка: %s", folder)


btn_choose = ctk.CTkButton(row, text="Выбрать папку...", width=140, command=choose_folder, font=FONT_BODY)
btn_choose.pack(side="right")

# --- Секция «Результат» ---
section_result = ctk.CTkFrame(main, fg_color="transparent")
section_result.pack(fill="both", expand=True, pady=(0, SECTION_GAP))

status_var = ctk.StringVar(value="")
status_label = ctk.CTkLabel(section_result, textvariable=status_var, text_color="gray", font=FONT_BODY)
status_label.pack(pady=(0, PAD_SM))

progress_bar = ctk.CTkProgressBar(section_result, height=12)
progress_bar.pack(pady=(0, PAD_SM), fill="x")
progress_bar.set(0)

result_text = ctk.CTkTextbox(section_result, height=180, font=FONT_MONO)
result_text.pack(fill="both", expand=True, pady=(0, PAD_SM))

# --- Секция «Действия» ---
btn_row = ctk.CTkFrame(main, fg_color="transparent")
btn_row.pack(fill="x", pady=PAD_SM)
btn_center_frame = ctk.CTkFrame(btn_row, fg_color="transparent")
btn_center_frame.pack(side="left", fill="x", expand=True)
btn_build = ctk.CTkButton(
    btn_center_frame,
    text="Сформировать отчёт за день",
    font=FONT_SECTION,
    fg_color="#2B7A2B",
    hover_color="#236B23",
)
btn_build.pack(anchor="center")


def _open_norms():
    _open_norms_window(app, config_path=CONFIG_PATH, line_numbers=LINE_NUMBERS, log=log)


def _open_comparison_window():
    """Открывает окно «Сравнение с нормативами» по данным последнего скана."""
    try:
        win = ctk.CTkToplevel(app)
    except Exception as e:
        log.exception("Ошибка открытия окна сравнения: %s", e)
        return
    try:
        win.wm_transient(app)
    except Exception:
        pass
    win.title("Сравнение с нормативами")
    win.geometry("720x480")
    win.minsize(520, 360)
    fr = ctk.CTkFrame(win, fg_color="transparent")
    fr.pack(fill="both", expand=True, padx=PAD, pady=PAD)
    txt = ctk.CTkTextbox(fr, font=FONT_MONO)
    txt.pack(fill="both", expand=True)
    if not last_scan_result:
        txt.insert("1.0", "Сначала сформируйте отчёт за день («Сформировать отчёт за день»), затем откройте это окно снова.")
    else:
        line_norms = load_line_norms(CONFIG_PATH, LINE_NUMBERS)
        comparison_lines, other_lines = _compare_downtimes_to_norms(last_scan_result, line_norms)
        block = ["--- Сравнение с нормативами (факт / норма, мин) ---", ""]
        if comparison_lines:
            block.extend(comparison_lines)
        else:
            block.append("Нет простоев с заданным нормативом и известной длительностью.")
        block.append("")
        block.append("--- Без нормы или не распознаны ---")
        block.append("")
        if other_lines:
            block.extend(other_lines)
        else:
            block.append("Нет таких простоев.")
        txt.insert("1.0", "\n".join(block))

    def _copy_comparison():
        content = txt.get("1.0", "end")
        if content.strip():
            app.clipboard_clear()
            app.clipboard_append(content)
            app.update()

    ctk.CTkButton(fr, text="Копировать", width=120, command=_copy_comparison, font=FONT_BODY).pack(anchor="w", pady=(PAD_SM, 0))
    win.update_idletasks()
    win.lift()
    try:
        win.focus_force()
    except Exception:
        pass


EMAIL_LINE_SEP = "══════════════════════════════════════════════════════"


def _show_email_copy_window(parent, text: str):
    """Окно с текстом для копирования в письмо и кнопкой «Копировать в буфер»."""
    res_win = ctk.CTkToplevel(parent)
    res_win.wm_transient(parent)
    res_win.title("Текст для копирования в письмо")
    res_win.geometry("620x420")
    res_win.minsize(480, 320)
    rfr = ctk.CTkFrame(res_win, fg_color="transparent")
    rfr.pack(fill="both", expand=True, padx=PAD, pady=PAD)
    rtxt = ctk.CTkTextbox(rfr, font=FONT_MONO)
    rtxt.pack(fill="both", expand=True)
    rtxt.insert("1.0", text)
    try:
        tk_text = getattr(rtxt, "_textbox", None) or getattr(rtxt, "tk_textbox", None)
        if tk_text is not None:
            tk_text.tag_configure("header", font=("Consolas", 12, "bold"))
            tk_text.tag_configure("sep", font=("Consolas", 11))
            for i, line in enumerate(text.split("\n"), start=1):
                s = line.strip()
                if s.startswith("Линия") and ("План/факт" in s or "," in s) or s.startswith("План/факт") or s == EMAIL_LINE_SEP or (s.startswith("═") and len(s) > 10):
                    tk_text.tag_add("header" if not s.startswith("═") else "sep", f"{i}.0", f"{i}.end")
    except Exception:
        pass
    def copy_email():
        t = rtxt.get("1.0", "end")
        if t.strip():
            app.clipboard_clear()
            app.clipboard_append(t)
            app.update()
    ctk.CTkButton(rfr, text="Копировать в буфер", width=160, command=copy_email, font=FONT_BODY).pack(anchor="w", pady=(PAD_SM, 0))
    res_win.update_idletasks()
    res_win.lift()
    try:
        res_win.focus_force()
    except Exception:
        pass


def _open_email_text_window():
    """Диалог по неплановым простоям > 30 мин: при выкл. переключателе — только план/факт без окна ввода; при вкл. — полный диалог с комментариями и статусом."""
    if not last_scan_result:
        win = ctk.CTkToplevel(app)
        win.wm_transient(app)
        win.title("Текст для письма")
        msg_fr = ctk.CTkFrame(win, fg_color="transparent")
        msg_fr.pack(fill="both", expand=True, padx=PAD, pady=PAD)
        ctk.CTkLabel(msg_fr, text="Сначала сформируйте отчёт за день.", font=FONT_BODY).pack(pady=(0, PAD_SM))
        ctk.CTkButton(msg_fr, text="OK", width=100, command=win.destroy, font=FONT_BODY).pack(pady=(0, PAD_SM))
        win.update_idletasks()
        win.lift()
        return
    items = _get_unplanned_long_downtimes(last_scan_result, min_minutes=30)
    if not items:
        win = ctk.CTkToplevel(app)
        win.wm_transient(app)
        win.title("Текст для письма")
        msg_fr = ctk.CTkFrame(win, fg_color="transparent")
        msg_fr.pack(fill="both", expand=True, padx=PAD, pady=PAD)
        ctk.CTkLabel(msg_fr, text="Нет неплановых простоев более 30 минут.", font=FONT_BODY).pack(pady=(0, PAD_SM))
        ctk.CTkButton(msg_fr, text="OK", width=100, command=win.destroy, font=FONT_BODY).pack(pady=(0, PAD_SM))
        win.update_idletasks()
        win.lift()
        return

    line_norms = load_line_norms(CONFIG_PATH, LINE_NUMBERS)
    plan_fact_map = _get_plan_fact_map(last_scan_result, line_norms)

    if not email_show_reasons_var.get():
        parts = ["План/факт по линиям."]
        for (line_num, day), (plan_val, fact_val) in sorted(plan_fact_map.items()):
            parts.append(f"Линия {line_num}, день {day}. План/факт: {plan_val} / {fact_val} шт.")
        if len(parts) <= 1:
            return
        _show_email_copy_window(app, "\n".join(parts))
        return

    PAGE_SIZE = 10
    total_pages = max(1, (len(items) + PAGE_SIZE - 1) // PAGE_SIZE)

    win = ctk.CTkToplevel(app)
    win.wm_transient(app)
    win.title("Неплановые простои — комментарий для письма")
    win.geometry("640x520")
    win.minsize(500, 400)
    fr = ctk.CTkScrollableFrame(win, fg_color="transparent")
    fr.pack(fill="both", expand=True, padx=PAD, pady=PAD)
    form_entries = []
    block_frames = []
    for idx, (line_num, day, d, duration) in enumerate(items):
        cap = f"Линия {line_num}, день {day}. Период: {d.start or '—'}–{d.end or '—'}. Длительность: {duration} мин."
        block = ctk.CTkFrame(fr, fg_color=("gray88", "gray20"), corner_radius=6)
        inner = ctk.CTkFrame(block, fg_color="transparent")
        inner.pack(fill="x", padx=PAD_SM, pady=PAD_SM)
        ctk.CTkLabel(inner, text=cap, font=FONT_SECTION).pack(anchor="w")
        ctk.CTkLabel(inner, text="Комментарий:", font=FONT_BODY).pack(anchor="w", pady=(PAD_SM, 2))
        comment_tb = ctk.CTkTextbox(inner, height=56, font=FONT_BODY)
        comment_tb.pack(fill="x", pady=(0, PAD_SM))
        comment_tb.insert("1.0", (d.description or d.kind or "").strip() or "")
        ctk.CTkLabel(inner, text="Принятые меры:", font=FONT_BODY).pack(anchor="w", pady=(PAD_SM, 2))
        measures_tb = ctk.CTkTextbox(inner, height=56, font=FONT_BODY)
        measures_tb.pack(fill="x", pady=(0, PAD_SM))
        ctk.CTkLabel(inner, text="Статус проблемы:", font=FONT_BODY).pack(anchor="w", pady=(PAD_SM, 2))
        status_var = ctk.StringVar(value="Не исправлена")
        ctk.CTkOptionMenu(inner, values=["Исправлена", "Не исправлена"], variable=status_var, width=200, font=FONT_BODY).pack(anchor="w")
        form_entries.append((comment_tb, measures_tb, status_var))
        block_frames.append(block)

    current_page = [1]

    def show_page(p: int):
        p = max(1, min(p, total_pages))
        current_page[0] = p
        for i, block in enumerate(block_frames):
            if (p - 1) * PAGE_SIZE <= i < p * PAGE_SIZE:
                block.pack(fill="x", pady=(0, PAD_SM))
            else:
                block.pack_forget()
        page_label.configure(text=f"Страница {p} из {total_pages}")
        btn_prev.configure(state="normal" if p > 1 else "disabled")
        btn_next.configure(state="normal" if p < total_pages else "disabled")

    page_row = ctk.CTkFrame(win, fg_color="transparent")
    page_row.pack(fill="x", padx=PAD, pady=(0, PAD_SM))
    btn_prev = ctk.CTkButton(page_row, text="← Назад", width=90, command=lambda: show_page(current_page[0] - 1), font=FONT_BODY)
    btn_prev.pack(side="left", padx=(0, PAD_SM))
    page_label = ctk.CTkLabel(page_row, text=f"Страница 1 из {total_pages}", font=FONT_BODY)
    page_label.pack(side="left")
    btn_next = ctk.CTkButton(page_row, text="Вперёд →", width=90, command=lambda: show_page(current_page[0] + 1), font=FONT_BODY)
    btn_next.pack(side="left", padx=(PAD_SM, 0))
    show_page(1)

    def build_and_show():
        parts = ["План/факт по линиям (все линии).", ""]
        for (line_num, day), (plan_val, fact_val) in sorted(plan_fact_map.items()):
            if parts and parts[-1] != "":
                parts.append("")
            parts.append(EMAIL_LINE_SEP)
            parts.append("")
            parts.append(f"Линия {line_num}, день {day}. План/факт: {plan_val} / {fact_val} шт.")
        parts.append("")
        parts.append("")
        parts.append(EMAIL_LINE_SEP)
        parts.append("")
        parts.append("Неплановые простои более 30 минут.")
        parts.append("")
        for (line_num, day, d, duration), (comment_tb, measures_tb, status_var) in zip(items, form_entries):
            comment = comment_tb.get("1.0", "end").strip()
            measures = measures_tb.get("1.0", "end").strip()
            status = status_var.get().strip()
            if parts and parts[-1] != "":
                parts.append("")
            parts.append(EMAIL_LINE_SEP)
            parts.append("")
            parts.append(f"Линия {line_num}, день {day}. Период: {d.start or '—'}–{d.end or '—'}. Длительность: {duration} мин.")
            parts.append(f"Комментарий: {comment or '—'}")
            parts.append(f"Принятые меры: {measures or '—'}")
            parts.append(f"Статус: {status}")
            parts.append("")
        text = "\n".join(parts).strip()
        _show_email_copy_window(win, text)

    ctk.CTkButton(win, text="Сформировать текст для письма", font=FONT_BODY, command=build_and_show).pack(pady=(0, PAD_SM))
    win.update_idletasks()
    win.lift()
    try:
        win.focus_force()
    except Exception:
        pass


def _open_log_window():
    """Открывает отдельное окно с логом."""
    try:
        win = ctk.CTkToplevel(app)
    except Exception as e:
        log.exception("Ошибка открытия окна лога: %s", e)
        return
    try:
        win.wm_transient(app)
    except Exception:
        pass
    win.title("Лог")
    win.geometry("700x400")
    win.minsize(500, 300)
    fr = ctk.CTkFrame(win, fg_color="transparent")
    fr.pack(fill="both", expand=True, padx=PAD, pady=PAD)
    log_txt = ctk.CTkTextbox(fr, font=FONT_MONO)
    log_txt.pack(fill="both", expand=True)
    log_txt.insert("1.0", "\n".join(log_buffer))
    log_txt.see("end")
    log_window_ref.append(log_txt)

    def _on_close():
        if log_window_ref and log_window_ref[0] == log_txt:
            log_window_ref.clear()
        win.destroy()

    def _save_log_from_window():
        path = filedialog.asksaveasfilename(
            title="Сохранить лог",
            defaultextension=".txt",
            filetypes=[("Текст", "*.txt"), ("Все файлы", "*.*")],
        )
        if path:
            try:
                Path(path).write_text(log_txt.get("1.0", "end"), encoding="utf-8")
                log.info("Лог сохранён: %s", path)
            except Exception as e:
                log.exception("Ошибка сохранения лога: %s", e)

    win.protocol("WM_DELETE_WINDOW", _on_close)
    btn_fr = ctk.CTkFrame(fr, fg_color="transparent")
    btn_fr.pack(fill="x", pady=(PAD_SM, 0))
    ctk.CTkButton(btn_fr, text="Скачать лог", width=120, command=_save_log_from_window, font=FONT_BODY).pack(side="left")
    win.update_idletasks()
    win.lift()
    try:
        win.focus_force()
    except Exception:
        pass


MENU_PLACEHOLDER = "▼ Меню"
_menu_actions = {
    "Лог": _open_log_window,
    "Нормативы плановых остановок": _open_norms,
    "Сравнение с нормативами": _open_comparison_window,
    "Текст для письма": _open_email_text_window,
}


def _on_menu_choice(choice: str):
    if choice in _menu_actions:
        _menu_actions[choice]()
        menu_choice_var.set(MENU_PLACEHOLDER)


menu_choice_var = ctk.StringVar(value=MENU_PLACEHOLDER)
ctk.CTkOptionMenu(
    btn_row,
    values=[MENU_PLACEHOLDER] + list(_menu_actions),
    variable=menu_choice_var,
    width=220,
    font=FONT_BODY,
    command=_on_menu_choice,
).pack(side="right", padx=(PAD_SM, 0))

# Очередь сообщений из потока в GUI
msg_queue: Queue = Queue()
log_buffer: list[str] = []
log_window_ref: list = []  # [CTkTextbox] или [] — виджет лога в отдельном окне

# Лог в очередь
logging.basicConfig(level=logging.DEBUG, force=True)
log = logging.getLogger(__name__)
_log_fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
_queue_handler = QueueLogHandler(msg_queue)
_queue_handler.setFormatter(_log_fmt)
logging.getLogger().addHandler(_queue_handler)


def process_queue():
    while True:
        try:
            msg = msg_queue.get_nowait()
        except Exception:
            break
        if msg["type"] == "status":
            status_var.set(msg["text"])
        elif msg["type"] == "progress":
            progress_bar.set(msg["value"])
        elif msg["type"] == "result":
            result_text.delete("1.0", "end")
            result_text.insert("1.0", msg["text"])
            status_var.set("Готово.")
            progress_bar.set(1.0)
        elif msg["type"] == "log":
            log_buffer.append(msg["text"])
            if log_window_ref:
                log_window_ref[0].insert("end", msg["text"] + "\n")
                log_window_ref[0].see("end")
        elif msg["type"] == "open_email_dialog":
            app.after(0, _open_email_text_window)
    app.after(100, process_queue)


def run_scan():
    folder = path_var.get().strip()
    day_val = day_var.get()
    if day_val == "Все":
        selected_day = None
    else:
        try:
            selected_day = int(day_val) if day_val else None
        except (ValueError, TypeError):
            selected_day = None
        if selected_day is None or selected_day < 1 or selected_day > 31:
            selected_day = _default_day
    save_folder(folder)
    result_text.delete("1.0", "end")
    log_buffer.clear()
    if log_window_ref:
        log_window_ref[0].delete("1.0", "end")
    progress_bar.set(0)
    status_var.set("Поиск файлов...")
    msg_queue.put({"type": "status", "text": "Поиск файлов..."})
    msg_queue.put({"type": "progress", "value": 0.0})
    log.info("Сканирование папки: %s, день: %s", folder, day_val)

    def work():
        files = find_line_files(folder)
        if not files:
            log.warning("Файлы линий не найдены в %s", folder)
            msg_queue.put({"type": "status", "text": "Файлы линий не найдены."})
            msg_queue.put({"type": "progress", "value": 0.0})
            msg_queue.put({"type": "result", "text": "В папке нет файлов вида «Сменный отчет линия № N ...»."})
            return
        total = len(files)
        lines_result = []
        completed = 0
        max_workers = min(8, total)  # до 8 потоков
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_line = {executor.submit(read_line_non_empty_days, path, selected_day): (line_num, path) for line_num, path in files}
            for future in as_completed(future_to_line):
                line_num, path = future_to_line[future]
                try:
                    day_infos = future.result()
                except Exception as e:
                    log.exception("Ошибка чтения %s: %s", path.name, e)
                    day_infos = []
                lines_result.append((line_num, path.name, day_infos))
                completed += 1
                msg_queue.put({"type": "status", "text": f"Читаю ({completed} из {total})..."})
                msg_queue.put({"type": "progress", "value": completed / total})
        lines_result.sort(key=lambda x: x[0])
        line_norms = load_line_norms(CONFIG_PATH, LINE_NUMBERS)
        plan_lines = _compute_plan(lines_result, line_norms, detailed=True)
        log.info("Сканирование завершено, линий: %s", len(lines_result))
        global last_scan_result
        last_scan_result = lines_result
        if selected_day is not None and lines_result:
            reports_dir = APP_DIR / "отчеты по сменам"
            reports_dir.mkdir(parents=True, exist_ok=True)
            now = datetime.now()
            out_name = f"отчет за {selected_day:02d}.{now.month:02d}.{now.year}.xlsx"
            out_path = reports_dir / out_name
            if build_consolidated_day_excel(folder, selected_day, lines_result, out_path):
                msg_queue.put({"type": "log", "text": f"Сводный Excel сохранён: {out_path}"})
            else:
                msg_queue.put({"type": "log", "text": "Не удалось сохранить сводный Excel."})
        msg_queue.put({"type": "status", "text": "Готово."})
        msg_queue.put({"type": "result", "text": "\n".join(plan_lines) if plan_lines else "Нет данных для расчёта плана."})
        unplanned_long = _get_unplanned_long_downtimes(lines_result, min_minutes=30)
        if unplanned_long:
            msg_queue.put({"type": "open_email_dialog"})

    threading.Thread(target=work, daemon=True).start()


btn_build.configure(command=run_scan)
app.after(100, process_queue)

# Развёрнутое окно при запуске (после отрисовки окна)
def _maximize_on_start():
    try:
        app.state("zoomed")  # Windows: развернуть
    except Exception:
        try:
            app.attributes("-zoomed", True)  # Linux
        except Exception:
            pass

app.update_idletasks()
app.after(100, _maximize_on_start)

if __name__ == "__main__":
    log.info("Запуск приложения")
    app.mainloop()
