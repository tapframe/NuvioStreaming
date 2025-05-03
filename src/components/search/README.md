# Search Components

This directory contains modular components used in the SearchScreen.

## Components

- **SearchBar**: Input field with search icon and clear button
- **SkeletonLoader**: Loading animation shown while searching
- **RecentSearches**: Shows recent search history
- **ResultsCarousel**: Horizontal scrolling list of search results by category
- **SearchResultItem**: Individual content card in the search results
- **EmptyResults**: Displayed when no search results are found

## Usage

```jsx
import {
  SearchBar,
  SkeletonLoader,
  RecentSearches,
  ResultsCarousel,
  EmptyResults
} from '../components/search';

// Use components in your screen...
```

## Refactoring Benefits

- Improved code organization
- Smaller, reusable components
- Better separation of concerns
- Easier maintenance and testing
- Reduced file size of main screen component 