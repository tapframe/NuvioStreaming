import React, { useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Alert,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { TraktContentComment } from '../../services/traktService';
import { logger } from '../../utils/logger';
import { useTraktComments } from '../../hooks/useTraktComments';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';

const { width } = Dimensions.get('window');

interface CommentsSectionProps {
  imdbId: string;
  type: 'movie' | 'show';
  season?: number;
  episode?: number;
  onCommentPress?: (comment: TraktContentComment) => void;
}

interface CommentItemProps {
  comment: TraktContentComment;
  theme: any;
}

// Compact comment card for horizontal scrolling
const CompactCommentCard: React.FC<{
  comment: TraktContentComment;
  theme: any;
  onPress: () => void;
  isSpoilerRevealed: boolean;
  onSpoilerPress: () => void;
}> = ({ comment, theme, onPress, isSpoilerRevealed, onSpoilerPress }) => {
  const [isPressed, setIsPressed] = useState(false);

  // Safety check - ensure comment data exists
  if (!comment || !comment.comment) {
    return null;
  }

  // Handle missing user data gracefully
  const user = comment.user || {};
  const username = user.name || user.username || 'Anonymous';

  // Handle spoiler content
  const hasSpoiler = comment.spoiler;
  const shouldBlurContent = hasSpoiler && !isSpoilerRevealed;

  const truncatedComment = comment.comment.length > 100
    ? comment.comment.substring(0, 100) + '...'
    : comment.comment;

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    try {
      const now = new Date();
      const commentDate = new Date(dateString);
      const diffMs = now.getTime() - commentDate.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      // For older dates, show month/day
      return commentDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return '';
    }
  };

  // Render stars for rating (convert 1-10 rating to 1-5 stars)
  const renderCompactStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating / 2); // Convert 10-point scale to 5 stars
    const hasHalfStar = rating % 2 >= 1;

    // Add full stars
    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <MaterialIcons key={`full-${i}`} name="star" size={10} color="#FFD700" />
      );
    }

    // Add half star if needed
    if (hasHalfStar) {
      stars.push(
        <MaterialIcons key="half" name="star-half" size={10} color="#FFD700" />
      );
    }

    // Add empty stars to make 5 total
    const filledStars = fullStars + (hasHalfStar ? 1 : 0);
    const emptyStars = 5 - filledStars;
    for (let i = 0; i < emptyStars; i++) {
      stars.push(
        <MaterialIcons key={`empty-${i}`} name="star-border" size={10} color="#FFD700" />
      );
    }

    return stars;
  };

  return (
    <TouchableOpacity
      style={[
        styles.compactCard,
        {
          backgroundColor: isPressed ? theme.colors.primary + '20' : theme.colors.card,
          borderColor: theme.colors.border,
          transform: isPressed ? [{ scale: 0.98 }] : [{ scale: 1 }]
        }
      ]}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      onPress={() => {
        console.log('CompactCommentCard: TouchableOpacity pressed for comment:', comment.id);
        onPress();
      }}
      activeOpacity={0.7}
    >
      {/* Header Section - Fixed at top */}
      <View style={styles.compactHeader}>
        <Text style={[styles.compactUsername, { color: theme.colors.highEmphasis }]}>
          {username}
        </Text>
        {user.vip && (
          <View style={styles.miniVipBadge}>
            <Text style={styles.miniVipText}>VIP</Text>
          </View>
        )}
      </View>

      {/* Rating - Show stars */}
      {comment.user_stats?.rating && (
        <View style={styles.compactRating}>
          {renderCompactStars(comment.user_stats.rating)}
          <Text style={[styles.compactRatingText, { color: theme.colors.mediumEmphasis }]}>
            {comment.user_stats.rating}/10
          </Text>
        </View>
      )}

      {/* Comment Preview - Flexible area that fills space */}
      <View style={[styles.commentContainer, shouldBlurContent ? styles.blurredContent : undefined]}>
        <Text
          style={[styles.compactComment, { color: theme.colors.highEmphasis }]}
          numberOfLines={shouldBlurContent ? 3 : undefined}
          ellipsizeMode="tail"
        >
          {shouldBlurContent ? '⚠️ This comment contains spoilers. Tap to reveal.' : truncatedComment}
        </Text>
      </View>

      {/* Meta Info - Fixed at bottom */}
      <View style={styles.compactMeta}>
        <View style={styles.compactBadges}>
          {comment.spoiler && (
            <Text style={[styles.spoilerMiniText, { color: theme.colors.error }]}>Spoiler</Text>
          )}
        </View>
        <View style={styles.compactStats}>
          <Text style={[styles.compactTime, { color: theme.colors.mediumEmphasis }]}>
            {formatRelativeTime(comment.created_at)}
          </Text>
          {comment.likes > 0 && (
            <Text style={[styles.compactStat, { color: theme.colors.mediumEmphasis }]}>
              👍 {comment.likes}
            </Text>
          )}
          {comment.replies > 0 && (
            <Text style={[styles.compactStat, { color: theme.colors.mediumEmphasis }]}>
              💬 {comment.replies}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// Expanded comment bottom sheet
const ExpandedCommentBottomSheet: React.FC<{
  comment: TraktContentComment | null;
  visible: boolean;
  onClose: () => void;
  theme: any;
  isSpoilerRevealed: boolean;
  onSpoilerPress: () => void;
}> = ({ comment, visible, onClose, theme, isSpoilerRevealed, onSpoilerPress }) => {
  const bottomSheetRef = useRef<BottomSheet>(null);

  // Handle visibility changes - always call this hook
  React.useEffect(() => {
    if (visible && comment) {
      bottomSheetRef.current?.expand();
    } else {
      bottomSheetRef.current?.close();
    }
  }, [visible, comment]);

  if (!comment) return null;

  const user = comment.user || {};
  const username = user.name || user.username || 'Anonymous User';
  const hasSpoiler = comment.spoiler;
  const shouldBlurModalContent = hasSpoiler && !isSpoilerRevealed;

  const formatDateParts = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const datePart = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const timePart = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return { datePart, timePart };
    } catch {
      return { datePart: 'Unknown date', timePart: '' };
    }
  };

  const renderStars = (rating: number | null) => {
    if (rating === null) return null;

    const stars = [];
    const fullStars = Math.floor(rating / 2);
    const hasHalfStar = rating % 2 >= 1;

    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <MaterialIcons key={`full-${i}`} name="star" size={16} color="#FFD700" />
      );
    }

    if (hasHalfStar) {
      stars.push(
        <MaterialIcons key="half" name="star-half" size={16} color="#FFD700" />
      );
    }

    const emptyStars = 5 - Math.ceil(rating / 2);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(
        <MaterialIcons key={`empty-${i}`} name="star-border" size={16} color="#FFD700" />
      );
    }

    return stars;
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      onChange={(index) => {
        if (index === -1) {
          onClose();
        }
      }}
      index={-1}
      snapPoints={[200, '50%', '90%']}
      enablePanDownToClose={true}
      animateOnMount={true}
      backgroundStyle={{
        backgroundColor: theme.colors.darkGray || '#0A0C0C',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
      }}
      handleIndicatorStyle={{
        backgroundColor: theme.colors.mediumEmphasis || '#CCCCCC',
      }}
    >
      <BottomSheetView style={[styles.bottomSheetContent, {
        backgroundColor: theme.colors.darkGray || '#0A0C0C',
      }]}>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <MaterialIcons name="close" size={24} color={theme.colors.highEmphasis} />
          </TouchableOpacity>

          {/* User Info */}
          <View style={styles.modalHeader}>
            <View style={styles.userInfo}>
              <Text style={[styles.modalUsername, { color: theme.colors.highEmphasis }]}>
                {username}
              </Text>
              {user.vip && (
                <View style={styles.vipBadge}>
                  <Text style={styles.vipText}>VIP</Text>
                </View>
              )}
            </View>
            {(() => {
              const { datePart, timePart } = formatDateParts(comment.created_at);
              return (
                <View style={styles.dateTimeContainer}>
                  <Text style={[styles.modalDate, { color: theme.colors.mediumEmphasis }]}>
                    {datePart}
                  </Text>
                  {!!timePart && (
                    <Text style={[styles.modalTime, { color: theme.colors.mediumEmphasis }]}>
                      {timePart}
                    </Text>
                  )}
                </View>
              );
            })()}
          </View>

          {/* Rating */}
          {comment.user_stats?.rating && (
            <View style={styles.modalRating}>
              {renderStars(comment.user_stats.rating)}
              <Text style={[styles.modalRatingText, { color: theme.colors.mediumEmphasis }]}>
                {comment.user_stats.rating}/10
              </Text>
            </View>
          )}

          {/* Full Comment */}
          {shouldBlurModalContent ? (
            <View style={styles.spoilerContainer}>
              <Text style={[styles.spoilerWarning, { color: theme.colors.error }]}>
                ⚠️ This comment contains spoilers
              </Text>
              <TouchableOpacity
                style={[styles.revealButton, { backgroundColor: theme.colors.primary }]}
                onPress={onSpoilerPress}
              >
                <Text style={[styles.revealButtonText, { color: theme.colors.white }]}>
                  Reveal Spoilers
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={styles.modalCommentScroll}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled
            >
              <Text style={[styles.modalComment, { color: theme.colors.highEmphasis }]}>
                {comment.comment}
              </Text>
            </ScrollView>
          )}

          {/* Comment Meta */}
          <View style={styles.modalMeta}>
            {comment.spoiler && (
              <Text style={[styles.spoilerText, { color: theme.colors.error }]}>Spoiler</Text>
            )}
            <View style={styles.modalStats}>
              {comment.likes > 0 && (
                <View style={styles.likesContainer}>
                  <MaterialIcons name="thumb-up" size={16} color={theme.colors.mediumEmphasis} />
                  <Text style={[styles.likesText, { color: theme.colors.mediumEmphasis }]}>
                    {comment.likes}
                  </Text>
                </View>
              )}
              {comment.replies > 0 && (
                <View style={styles.repliesContainer}>
                  <MaterialIcons name="chat-bubble-outline" size={16} color={theme.colors.mediumEmphasis} />
                  <Text style={[styles.repliesText, { color: theme.colors.mediumEmphasis }]}>
                    {comment.replies}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </BottomSheetView>
    </BottomSheet>
  );
};

export const CommentsSection: React.FC<CommentsSectionProps> = ({
  imdbId,
  type,
  season,
  episode,
  onCommentPress,
}) => {
  const { currentTheme } = useTheme();

  const {
    comments,
    loading,
    error,
    hasMore,
    isAuthenticated,
    loadMore,
    refresh,
  } = useTraktComments({
    imdbId,
    type: type === 'show' ? (season !== undefined && episode !== undefined ? 'episode' :
             season !== undefined ? 'season' : 'show') : 'movie',
    season,
    episode,
    enabled: true,
  });

  // Debug logging
  console.log('CommentsSection: Comments data:', comments);
  console.log('CommentsSection: Comments length:', comments?.length);
  console.log('CommentsSection: Loading:', loading);
  console.log('CommentsSection: Error:', error);

  const renderComment = useCallback(({ item }: { item: TraktContentComment }) => {
    // Safety check for null/undefined items
    if (!item || !item.id) {
      console.log('CommentsSection: Invalid comment item:', item);
      return null;
    }

    console.log('CommentsSection: Rendering comment:', item.id);

    return (
      <CompactCommentCard
        comment={item}
        theme={currentTheme}
        onPress={() => {
          console.log('CommentsSection: Comment pressed:', item.id);
          onCommentPress?.(item);
        }}
        isSpoilerRevealed={true}
        onSpoilerPress={() => {
          // Do nothing for now - spoilers are handled by parent
        }}
      />
    );
  }, [currentTheme, onCommentPress]);

  const renderEmpty = useCallback(() => {
    if (loading) return null;

    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="chat-bubble-outline" size={48} color={currentTheme.colors.mediumEmphasis} />
        <Text style={[styles.emptyText, { color: currentTheme.colors.mediumEmphasis }]}>
          {error ? 'Comments unavailable' : 'No comments yet'}
        </Text>
        <Text style={[styles.emptySubtext, { color: currentTheme.colors.disabled }]}>
          {error
            ? 'This content may not be in Trakt\'s database yet'
            : 'Be the first to comment on Trakt.tv'
          }
        </Text>
      </View>
    );
  }, [loading, error, currentTheme]);

  // Don't show section if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: currentTheme.colors.highEmphasis }]}>
          Trakt Comments
        </Text>
      </View>

      {error && (
        <View style={[styles.errorContainer, { backgroundColor: currentTheme.colors.card }]}>
          <MaterialIcons name="error-outline" size={20} color={currentTheme.colors.error} />
          <Text style={[styles.errorText, { color: currentTheme.colors.error }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { borderColor: currentTheme.colors.error }]}
            onPress={refresh}
          >
            <Text style={[styles.retryButtonText, { color: currentTheme.colors.error }]}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && comments.length === 0 && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={currentTheme.colors.primary} />
          <Text style={[styles.loadingText, { color: currentTheme.colors.mediumEmphasis }]}>
            Loading comments...
          </Text>
        </View>
      )}

      {comments.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={comments}
          keyExtractor={(item) => item?.id?.toString() || Math.random().toString()}
          renderItem={renderComment}
          contentContainerStyle={styles.horizontalList}
          removeClippedSubviews={false}
          getItemLayout={(data, index) => ({
            length: 292, // width + marginRight
            offset: 292 * index,
            index,
          })}
          onEndReached={() => {
            if (hasMore && !loading) {
              loadMore();
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            hasMore ? (
              <View style={styles.loadMoreContainer}>
                <TouchableOpacity
                  style={[styles.loadMoreButton, { backgroundColor: currentTheme.colors.card }]}
                  onPress={loadMore}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={currentTheme.colors.primary} />
                  ) : (
                    <>
                      <Text style={[styles.loadMoreText, { color: currentTheme.colors.primary }]}>
                        Load More
                      </Text>
                      <MaterialIcons name="chevron-right" size={20} color={currentTheme.colors.primary} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}

    </View>
  );
};

// BottomSheet component that should be rendered at a higher level
export const CommentBottomSheet: React.FC<{
  comment: TraktContentComment | null;
  visible: boolean;
  onClose: () => void;
  theme: any;
  isSpoilerRevealed: boolean;
  onSpoilerPress: () => void;
}> = ({ comment, visible, onClose, theme, isSpoilerRevealed, onSpoilerPress }) => {
  const bottomSheetRef = useRef<BottomSheet>(null);

  console.log('CommentBottomSheet: Rendered with visible:', visible, 'comment:', comment?.id);

  // Calculate the index based on visibility - start at medium height (50%)
  const sheetIndex = visible && comment ? 1 : -1;

  console.log('CommentBottomSheet: Calculated sheetIndex:', sheetIndex);

  if (!comment) return null;

  const user = comment.user || {};
  const username = user.name || user.username || 'Anonymous User';
  const hasSpoiler = comment.spoiler;
  const shouldBlurModalContent = hasSpoiler && !isSpoilerRevealed;

  const formatDateParts = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const datePart = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const timePart = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return { datePart, timePart };
    } catch {
      return { datePart: 'Unknown date', timePart: '' };
    }
  };

  const renderStars = (rating: number | null) => {
    if (rating === null) return null;

    const stars = [];
    const fullStars = Math.floor(rating / 2);
    const hasHalfStar = rating % 2 >= 1;

    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <MaterialIcons key={`full-${i}`} name="star" size={16} color="#FFD700" />
      );
    }

    if (hasHalfStar) {
      stars.push(
        <MaterialIcons key="half" name="star-half" size={16} color="#FFD700" />
      );
    }

    const emptyStars = 5 - Math.ceil(rating / 2);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(
        <MaterialIcons key={`empty-${i}`} name="star-border" size={16} color="#FFD700" />
      );
    }

    return stars;
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      onChange={(index) => {
        console.log('CommentBottomSheet: onChange called with index:', index);
        if (index === -1) {
          onClose();
        }
      }}
      index={sheetIndex}
      snapPoints={[200, '50%']}
      enablePanDownToClose={true}
      animateOnMount={true}
      backgroundStyle={{
        backgroundColor: theme.colors.darkGray || '#0A0C0C',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
      }}
      handleIndicatorStyle={{
        backgroundColor: theme.colors.mediumEmphasis || '#CCCCCC',
      }}
    >
      <BottomSheetView style={[styles.bottomSheetContent, {
        backgroundColor: theme.colors.darkGray || '#0A0C0C',
      }]}>
          {/* User Info */}
          <View style={styles.modalHeader}>
            <View style={styles.userInfo}>
              <Text style={[styles.modalUsername, { color: theme.colors.highEmphasis }]}>
                {username}
              </Text>
              {user.vip && (
                <View style={styles.vipBadge}>
                  <Text style={styles.vipText}>VIP</Text>
                </View>
              )}
            </View>
            {(() => {
              const { datePart, timePart } = formatDateParts(comment.created_at);
              return (
                <View style={styles.dateTimeContainer}>
                  <Text style={[styles.modalDate, { color: theme.colors.mediumEmphasis }]}>
                    {datePart}
                  </Text>
                  {!!timePart && (
                    <Text style={[styles.modalTime, { color: theme.colors.mediumEmphasis }]}>
                      {timePart}
                    </Text>
                  )}
                </View>
              );
            })()}
          </View>

          {/* Rating */}
          {comment.user_stats?.rating && (
            <View style={styles.modalRating}>
              {renderStars(comment.user_stats.rating)}
              <Text style={[styles.modalRatingText, { color: theme.colors.mediumEmphasis }]}>
                {comment.user_stats.rating}/10
              </Text>
            </View>
          )}

          {/* Full Comment */}
          {shouldBlurModalContent ? (
            <View style={styles.spoilerContainer}>
              <Text style={[styles.spoilerWarning, { color: theme.colors.error }]}>
                ⚠️ This comment contains spoilers
              </Text>
              <TouchableOpacity
                style={[styles.revealButton, { backgroundColor: theme.colors.primary }]}
                onPress={onSpoilerPress}
              >
                <Text style={[styles.revealButtonText, { color: theme.colors.white }]}>
                  Reveal Spoilers
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={styles.modalCommentScroll}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled
            >
              <Text style={[styles.modalComment, { color: theme.colors.highEmphasis }]}>
                {comment.comment}
              </Text>
            </ScrollView>
          )}

          {/* Comment Meta */}
          <View style={styles.modalMeta}>
            {comment.spoiler && (
              <Text style={[styles.spoilerText, { color: theme.colors.error }]}>Spoiler</Text>
            )}
            <View style={styles.modalStats}>
              {comment.likes > 0 && (
                <View style={styles.likesContainer}>
                  <MaterialIcons name="thumb-up" size={16} color={theme.colors.mediumEmphasis} />
                  <Text style={[styles.likesText, { color: theme.colors.mediumEmphasis }]}>
                    {comment.likes}
                  </Text>
                </View>
              )}
              {comment.replies > 0 && (
                <View style={styles.repliesContainer}>
                  <MaterialIcons name="chat-bubble-outline" size={16} color={theme.colors.mediumEmphasis} />
                  <Text style={[styles.repliesText, { color: theme.colors.mediumEmphasis }]}>
                    {comment.replies}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </BottomSheetView>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
  },
  horizontalList: {
    paddingRight: 16,
  },
  compactCard: {
    width: 280,
    height: 160,
    padding: 12,
    marginRight: 12,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flexDirection: 'column',
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  compactUsername: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  miniVipBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 6,
  },
  miniVipText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#000',
  },
  compactRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 2,
  },
  compactRatingText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  commentContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    marginBottom: 8,
  },
  compactComment: {
    fontSize: 14,
    lineHeight: 20,
  },
  blurredContent: {
    opacity: 0.3,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    padding: 8,
    borderRadius: 4,
  },
  compactMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactBadges: {
    flexDirection: 'row',
    gap: 4,
  },
  spoilerMiniText: {
    fontSize: 11,
    fontWeight: '700',
  },
  compactStats: {
    flexDirection: 'row',
    gap: 8,
  },
  compactStat: {
    fontSize: 12,
  },
  compactTime: {
    fontSize: 11,
    fontWeight: '500',
  },
  loadMoreContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  commentItem: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  vipBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  vipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000',
  },
  date: {
    fontSize: 12,
  },
  contentTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ratingText: {
    fontSize: 12,
    marginLeft: 4,
  },
  commentText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spoilerText: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 8,
  },
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  likesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  likesText: {
    fontSize: 12,
    marginLeft: 4,
  },
  repliesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  repliesText: {
    fontSize: 12,
    marginLeft: 4,
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 12,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  retryButton: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 12,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  bottomSheetContent: {
    flex: 1,
    padding: 20,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingTop: 20,
  },
  modalUsername: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  modalDate: {
    fontSize: 12,
    marginTop: 4,
  },
  modalTime: {
    fontSize: 12,
    marginTop: 2,
  },
  dateTimeContainer: {
    alignItems: 'flex-end',
  },
  modalRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalRatingText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalComment: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  modalCommentScroll: {
    // Constrain height so only text area scrolls, not the entire modal
    maxHeight: 400,
    marginBottom: 16,
    flexShrink: 1,
  },
  spoilerContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  spoilerWarning: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  revealButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  revealButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalStats: {
    flexDirection: 'row',
    gap: 12,
  },
});
