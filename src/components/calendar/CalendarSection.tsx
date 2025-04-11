import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Dimensions 
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../styles/colors';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  isSameMonth, 
  isSameDay,
  getDay, 
  isToday, 
  parseISO
} from 'date-fns';
import Animated, { FadeIn } from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 7; // 7 days in a week
const DAY_ITEM_SIZE = width / 9; // Slightly smaller than 1/7 to fit all days

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
}: DayItemProps) => (
  <TouchableOpacity 
    style={[
      styles.dayItem, 
      today && styles.todayItem,
      isSelected && styles.selectedItem,
      hasEvents && styles.dayWithEvents
    ]} 
    onPress={() => onPress(date)}
  >
    <Text style={[
      styles.dayText, 
      !isCurrentMonth && styles.otherMonthDay,
      today && styles.todayText,
      isSelected && styles.selectedDayText
    ]}>
      {date.getDate()}
    </Text>
    {hasEvents && (
      <View style={styles.eventIndicator} />
    )}
  </TouchableOpacity>
);

export const CalendarSection: React.FC<CalendarSectionProps> = ({ 
  episodes = [], 
  onSelectDate 
}) => {
  console.log(`[CalendarSection] Rendering with ${episodes.length} episodes`);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const scrollViewRef = useRef<ScrollView>(null);

  // Map of dates with episodes
  const [datesWithEpisodes, setDatesWithEpisodes] = useState<{ [key: string]: boolean }>({});

  // Process episodes to identify dates with content
  useEffect(() => {
    console.log(`[CalendarSection] Processing ${episodes.length} episodes for calendar dots`);
    const dateMap: { [key: string]: boolean } = {};
    
    episodes.forEach(episode => {
      if (episode.releaseDate) {
        const releaseDate = parseISO(episode.releaseDate);
        const dateKey = format(releaseDate, 'yyyy-MM-dd');
        dateMap[dateKey] = true;
      }
    });
    
    console.log(`[CalendarSection] Found ${Object.keys(dateMap).length} unique dates with episodes`);
    setDatesWithEpisodes(dateMap);
  }, [episodes]);

  const goToPreviousMonth = () => {
    setCurrentDate(prevDate => subMonths(prevDate, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(prevDate => addMonths(prevDate, 1));
  };

  const handleDayPress = (date: Date) => {
    setSelectedDate(date);
    if (onSelectDate) {
      onSelectDate(date);
    }
  };

  // Generate days for the current month view
  const generateDaysForMonth = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = new Date(monthStart);
    
    // Adjust the start date to the beginning of the week
    const dayOfWeek = getDay(startDate);
    startDate.setDate(startDate.getDate() - dayOfWeek);
    
    // Ensure we have 6 complete weeks in our view
    const endDate = new Date(monthEnd);
    const lastDayOfWeek = getDay(endDate);
    if (lastDayOfWeek < 6) {
      endDate.setDate(endDate.getDate() + (6 - lastDayOfWeek));
    }
    
    // Get dates for a complete 6-week calendar
    const totalDaysNeeded = 42; // 6 weeks × 7 days
    const daysInView = [];
    
    let currentDateInView = new Date(startDate);
    for (let i = 0; i < totalDaysNeeded; i++) {
      daysInView.push(new Date(currentDateInView));
      currentDateInView.setDate(currentDateInView.getDate() + 1);
    }
    
    return daysInView;
  };

  const dayItems = generateDaysForMonth();
  
  // Break days into rows (6 rows of 7 days each)
  const rows = [];
  for (let i = 0; i < dayItems.length; i += COLUMN_COUNT) {
    rows.push(dayItems.slice(i, i + COLUMN_COUNT));
  }

  // Get weekday names for header
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goToPreviousMonth} style={styles.headerButton}>
          <MaterialIcons name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        
        <Text style={styles.monthTitle}>
          {format(currentDate, 'MMMM yyyy')}
        </Text>
        
        <TouchableOpacity onPress={goToNextMonth} style={styles.headerButton}>
          <MaterialIcons name="chevron-right" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.weekHeader}>
        {weekDays.map((day, index) => (
          <View key={index} style={styles.weekHeaderItem}>
            <Text style={styles.weekDayText}>{day}</Text>
          </View>
        ))}
      </View>
      
      <View style={styles.calendarGrid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((date, cellIndex) => {
              const isCurrentMonthDay = isSameMonth(date, currentDate);
              const isSelectedToday = isToday(date);
              const isDateSelected = isSameDay(date, selectedDate);
              
              // Check if this date has episodes
              const dateKey = format(date, 'yyyy-MM-dd');
              const hasEvents = datesWithEpisodes[dateKey] || false;
              
              // Log every 7 days to avoid console spam
              if (cellIndex === 0 && rowIndex === 0) {
                console.log(`[CalendarSection] Sample date check - ${dateKey}: hasEvents=${hasEvents}`);
              }
              
              return (
                <DayItem
                  key={cellIndex}
                  date={date}
                  isCurrentMonth={isCurrentMonthDay}
                  isToday={isSelectedToday}
                  isSelected={isDateSelected}
                  hasEvents={hasEvents}
                  onPress={handleDayPress}
                />
              );
            })}
          </View>
        ))}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.darkBackground,
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  weekHeader: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  weekHeaderItem: {
    width: DAY_ITEM_SIZE,
    alignItems: 'center',
  },
  weekDayText: {
    fontSize: 12,
    color: colors.lightGray,
  },
  calendarGrid: {
    padding: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  dayItem: {
    width: DAY_ITEM_SIZE,
    height: DAY_ITEM_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: DAY_ITEM_SIZE / 2,
  },
  dayText: {
    fontSize: 14,
    color: colors.text,
  },
  otherMonthDay: {
    color: colors.lightGray + '80', // 50% opacity
  },
  todayItem: {
    backgroundColor: colors.primary + '30', // 30% opacity
    borderWidth: 1,
    borderColor: colors.primary,
  },
  selectedItem: {
    backgroundColor: colors.primary + '60', // 60% opacity
    borderWidth: 1,
    borderColor: colors.primary,
  },
  todayText: {
    fontWeight: 'bold',
    color: colors.primary,
  },
  selectedDayText: {
    fontWeight: 'bold',
    color: colors.text,
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
    backgroundColor: colors.primary,
  },
}); 