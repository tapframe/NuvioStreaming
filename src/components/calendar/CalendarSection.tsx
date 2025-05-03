import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Dimensions 
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay } from 'date-fns';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 7; // 7 days in a week
const DAY_ITEM_SIZE = (width - 32 - 56) / 7; // Slightly smaller than 1/7 to fit all days
const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarEpisode {
  id: string;
  releaseDate: string;
  // Other properties can be included but aren't needed for the calendar
}

interface DayItemProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  hasEvents: boolean;
  onPress: (date: Date) => void;
}

interface CalendarSectionProps {
  episodes?: CalendarEpisode[];
  onSelectDate?: (date: Date) => void;
}

const DayItem = ({ 
  date, 
  isCurrentMonth, 
  isToday: today, 
  isSelected,
  hasEvents, 
  onPress 
}: DayItemProps) => {
  const { currentTheme } = useTheme();
  return (
    <TouchableOpacity 
      style={[
        styles.dayButton, 
        today && styles.todayItem,
        isSelected && styles.selectedItem,
        hasEvents && styles.dayWithEvents
      ]} 
      onPress={() => onPress(date)}
    >
      <Text style={[
        styles.dayText, 
        !isCurrentMonth && { color: currentTheme.colors.lightGray + '80' },
        today && styles.todayText,
        isSelected && styles.selectedDayText
      ]}>
        {date.getDate()}
      </Text>
      {hasEvents && (
        <View style={[styles.eventIndicator, { backgroundColor: currentTheme.colors.primary }]} />
      )}
    </TouchableOpacity>
  );
};

export const CalendarSection: React.FC<CalendarSectionProps> = ({ 
  episodes = [], 
  onSelectDate 
}) => {
  const { currentTheme } = useTheme();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Map of dates with episodes
  const [datesWithEpisodes, setDatesWithEpisodes] = useState<{ [key: string]: boolean }>({});

  // Process episodes to identify dates with content
  useEffect(() => {
    console.log(`[CalendarSection] Processing ${episodes.length} episodes for calendar dots`);
    const dateMap: { [key: string]: boolean } = {};
    
    episodes.forEach(episode => {
      if (episode.releaseDate) {
        const releaseDate = new Date(episode.releaseDate);
        const dateKey = format(releaseDate, 'yyyy-MM-dd');
        dateMap[dateKey] = true;
      }
    });
    
    console.log(`[CalendarSection] Found ${Object.keys(dateMap).length} unique dates with episodes`);
    setDatesWithEpisodes(dateMap);
  }, [episodes]);

  const goToPreviousMonth = useCallback(() => {
    setCurrentDate(prev => subMonths(prev, 1));
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentDate(prev => addMonths(prev, 1));
  }, []);

  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate(date);
    onSelectDate?.(date);
  }, [onSelectDate]);

  const renderDays = () => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start, end });

    // Get the day of the week for the first day (0-6)
    const firstDayOfWeek = start.getDay();

    // Add empty days at the start
    const emptyDays = Array(firstDayOfWeek).fill(null);

    // Calculate remaining days to fill the last row
    const totalDays = emptyDays.length + days.length;
    const remainingDays = 7 - (totalDays % 7);
    const endEmptyDays = remainingDays === 7 ? [] : Array(remainingDays).fill(null);

    const allDays = [...emptyDays, ...days, ...endEmptyDays];
    const weeks = [];

    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }

    return weeks.map((week, weekIndex) => (
      <View key={weekIndex} style={styles.weekRow}>
        {week.map((day, dayIndex) => {
          if (!day) {
            return <View key={`empty-${dayIndex}`} style={styles.emptyDay} />;
          }

          const isCurrentMonth = isSameMonth(day, currentDate);
          const isCurrentDay = isToday(day);
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const hasEvents = datesWithEpisodes[format(day, 'yyyy-MM-dd')] || false;

          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={[
                styles.dayButton,
                isCurrentDay && [styles.todayItem, { backgroundColor: currentTheme.colors.primary + '30', borderColor: currentTheme.colors.primary }],
                isSelected && [styles.selectedItem, { backgroundColor: currentTheme.colors.primary + '60', borderColor: currentTheme.colors.primary }],
                hasEvents && styles.dayWithEvents
              ]}
              onPress={() => handleDateSelect(day)}
            >
              <Text
                style={[
                  styles.dayText,
                  { color: currentTheme.colors.text },
                  !isCurrentMonth && { color: currentTheme.colors.lightGray + '80' },
                  isCurrentDay && [styles.todayText, { color: currentTheme.colors.primary }],
                  isSelected && [styles.selectedDayText, { color: currentTheme.colors.text }]
                ]}
              >
                {format(day, 'd')}
              </Text>
              {hasEvents && (
                <View style={[styles.eventDot, { backgroundColor: currentTheme.colors.primary }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    ));
  };

  return (
    <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
      <View style={[styles.header, { borderBottomColor: currentTheme.colors.border }]}>
        <TouchableOpacity 
          onPress={goToPreviousMonth}
          style={styles.headerButton}
        >
          <MaterialIcons name="chevron-left" size={24} color={currentTheme.colors.text} />
        </TouchableOpacity>
        
        <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>
          {format(currentDate, 'MMMM yyyy')}
        </Text>
        
        <TouchableOpacity 
          onPress={goToNextMonth}
          style={styles.headerButton}
        >
          <MaterialIcons name="chevron-right" size={24} color={currentTheme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekDaysContainer}>
        {weekDays.map((day, index) => (
          <Text 
            key={index} 
            style={[styles.weekDayText, { color: currentTheme.colors.lightGray }]}
          >
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.daysContainer}>
        {renderDays()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  weekDaysContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 8,
  },
  weekDayText: {
    fontSize: 12,
  },
  daysContainer: {
    padding: 8,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  dayButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayText: {
    fontSize: 14,
  },
  emptyDay: {
    width: 36,
    height: 36,
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: 'absolute',
    bottom: 6,
  },
  todayItem: {
    borderWidth: 1,
  },
  selectedItem: {
    borderWidth: 1,
  },
  todayText: {
    fontWeight: 'bold',
  },
  selectedDayText: {
    fontWeight: 'bold',
  },
  dayWithEvents: {
    position: 'relative',
  },
  eventIndicator: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
}); 