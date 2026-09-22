export interface FormattedLogDateTime {
  date: string;
  time: string;
  timestamp: string;
}

/**
 * Creates standardized date and time strings for CDC audit & dispatch logs:
 * Date: DD/MM/YYYY (e.g. 23/09/2026)
 * Time: HH:MM AM/PM (e.g. 10:42 AM)
 * Timestamp: DATE :DD/MM/YYYY TIME:HH:MM AM/PM
 */
export const createLogTimestamp = (dateInput: Date | string | number = new Date()): FormattedLogDateTime => {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  const day = String(validDate.getDate()).padStart(2, '0');
  const month = String(validDate.getMonth() + 1).padStart(2, '0');
  const year = validDate.getFullYear();

  let hours = validDate.getHours();
  const minutes = String(validDate.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = String(hours).padStart(2, '0');

  const dateStr = `${day}/${month}/${year}`;
  const timeStr = `${hoursStr}:${minutes} ${ampm}`;

  return {
    date: dateStr,
    time: timeStr,
    timestamp: `DATE :${dateStr} TIME:${timeStr}`,
  };
};

/**
 * Parses and extracts Date and Time from an InventoryLog object or timestamp string
 */
export const formatLogDateTime = (
  logOrTimestamp: { date?: string; time?: string; timestamp?: string } | string
): FormattedLogDateTime => {
  if (typeof logOrTimestamp === 'object' && logOrTimestamp !== null) {
    if (logOrTimestamp.date && logOrTimestamp.time) {
      return {
        date: logOrTimestamp.date,
        time: logOrTimestamp.time,
        timestamp: logOrTimestamp.timestamp || `DATE :${logOrTimestamp.date} TIME:${logOrTimestamp.time}`,
      };
    }
    if (logOrTimestamp.timestamp) {
      return formatLogDateTime(logOrTimestamp.timestamp);
    }
  }

  const str = typeof logOrTimestamp === 'string' ? logOrTimestamp : '';

  // Check if string contains "DATE :... TIME:..."
  const dateMatch = str.match(/DATE\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const timeMatch = str.match(/TIME\s*:\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);

  if (dateMatch && timeMatch) {
    return {
      date: dateMatch[1],
      time: timeMatch[1],
      timestamp: str,
    };
  }

  // Check if parseable Date
  const parsedDate = new Date(str);
  if (!isNaN(parsedDate.getTime()) && str.length > 8) {
    return createLogTimestamp(parsedDate);
  }

  // Fallback: If only time was provided (e.g. "11:42 AM")
  const today = createLogTimestamp();
  if (str.includes(':')) {
    const cleanTime = str.replace(/^(?:TIME\s*:\s*)?/i, '').trim();
    return {
      date: today.date,
      time: cleanTime,
      timestamp: `DATE :${today.date} TIME:${cleanTime}`,
    };
  }

  return today;
};
