// Gaps are measured between group starts. Zero lets groups share the stage.
export function defaultProgramme(stock) {
  const groups = [];
  stock.forEach((count, id) => {
    if (count) groups.push({ id, count, gap: groups.length ? 2 : 0 });
  });
  return groups;
}

export function cueSheet(groups) {
  let at = 0;
  return groups.map(group => {
    at += group.gap;
    return { ...group, at };
  });
}

export function editGroup(groups, index, action, value) {
  const row = groups[index];
  if (!row) return false;
  if (action === 'gap' && Number.isInteger(value) && value >= 0 && value <= 30) {
    row.gap = value;
  } else if (action === 'split' && row.count > 1) {
    row.count--;
    groups.splice(index + 1, 0, { id: row.id, count: 1, gap: 0 });
  } else if (action === 'merge') {
    const other = groups.find((g, i) => i !== index && g.id === row.id);
    if (!other) return false;
    other.count += row.count;
    groups.splice(index, 1);
  } else if (action === 'earlier' || action === 'later') {
    const other = index + (action === 'earlier' ? -1 : 1);
    if (!groups[other]) return false;
    // Swapping the acts preserves the time slots the player has set.
    [row.id, groups[other].id] = [groups[other].id, row.id];
    [row.count, groups[other].count] = [groups[other].count, row.count];
  } else return false;
  return true;
}
