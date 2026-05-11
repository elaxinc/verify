import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, RefreshControl, ImageBackground, TextInput, TouchableOpacity, Image, FlatList, Platform, Animated, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import Fuse from 'fuse.js';
import { useAppContext } from '../context/AppContext';
import { colors } from '../styles/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { FocusButton, MovieCard, FocusableSearchInput, FocusableMovieGridItem } from '../components/FocusableComponents';
import { SearchOverlay } from '../components/SearchOverlay';
import { BottomNavBar } from '../components/BottomNavBar';
import FloatingCoin from '../components/FloatingCoin';
import { SkeletonCarousel, SkeletonFeatured } from '../components/SkeletonLoader';
import useAuth from '../hooks/useAuth';
import { getVideosFeed, getVideosByCategory, getCategories, searchVideos, getFeaturedVideos } from '../services/api';
import { api } from '../services/api';

const { width } = Dimensions.get('window');
const IS_WIDE_SCREEN = width > 800;
const IS_TV = Platform.isTV;
const TV_SCALE = IS_TV ? 0.5 : 1;
const GRID_COLUMNS = IS_TV ? 6 : (IS_WIDE_SCREEN ? 6 : 3);
const GRID_ITEM_WIDTH = IS_TV ? 124 : ((width - 60) / 3);
const GRID_ITEM_HEIGHT = IS_TV ? 186 : (GRID_ITEM_WIDTH * 1.5);
const CARD_WIDTH = IS_TV ? 124 : (width * 0.35);
const CARD_HEIGHT = IS_TV ? 186 : (CARD_WIDTH * 1.5);
const FEATURED_AUTO_ROTATE_INTERVAL = 5000; // 5 segundos

const FocusGuideRow = memo(({ rowIndex, onNextRow }) => {
  if (!IS_TV) return null;
  
  return (
    <Pressable
      onPress={onNextRow}
      focusable={true}
      hasTVPreferredFocus={rowIndex === 0}
      style={styles.focusGuideRow}
    >
      <View style={styles.focusGuideContent}>
        <Text style={styles.focusGuideText}>Fim ↓</Text>
      </View>
    </Pressable>
  );
});

const FeaturedCarousel = memo(({ items, onNavigate, showConfig }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!items || items.length <= 1) return;

    const interval = setInterval(() => {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        // Troca o índice
        setCurrentIndex(prev => (prev + 1) % items.length);
        // Fade in
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }, FEATURED_AUTO_ROTATE_INTERVAL);

    return () => clearInterval(interval);
  }, [items, fadeAnim]);

  if (!items || items.length === 0) return null;

  const currentItem = items[currentIndex];

  return (
    <View style={styles.featuredContainer}>
      <Animated.View style={[styles.featuredWrapper, { opacity: fadeAnim }]}>
        <ImageBackground
          source={{ uri: currentItem.coverUrl || currentItem.thumbnailUrl }}
          style={styles.featuredBg}
          resizeMode="cover"
        >
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)', colors.cyber.black]}
            style={styles.featuredGradient}
          />
          <View style={styles.featuredContent}>
            <Text style={styles.featuredTitle} numberOfLines={2}>{currentItem.title}</Text>
            <Text style={styles.featuredSynopsis} numberOfLines={2}>
              {currentItem.synopsis}
            </Text>
            <View style={styles.featuredButtons}>
              <FocusButton
                title="Assistir"
                icon="play"
                onPress={() => onNavigate('Player', { id: currentItem.id })}
              />
              <FocusButton
                title="Info"
                icon="information-circle-outline"
                onPress={() => onNavigate('Info', { id: currentItem.id })}
              />
              {showConfig && (
                <FocusButton
                  title="Configurações"
                  icon="settings-outline"
                  onPress={() => onNavigate('Settings')}
                />
              )}
            </View>
          </View>
        </ImageBackground>
      </Animated.View>
      
      {/* Indicadores de carrossel */}
      {items.length > 1 && (
        <View style={styles.featuredIndicators}>
          {items.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.indicator,
                idx === currentIndex && styles.indicatorActive
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
});

const FeaturedContent = memo(({ item, onNavigate, showConfig }) => {
  if (!item) return null;
  
  return (
    <View style={styles.featuredContainer}>
      <ImageBackground
        source={{ uri: item.coverUrl || item.thumbnailUrl }}
        style={styles.featuredBg}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)', colors.cyber.black]}
          style={styles.featuredGradient}
        />
        <View style={styles.featuredContent}>
          <Text style={styles.featuredTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.featuredSynopsis} numberOfLines={2}>
            {item.synopsis}
          </Text>
          <View style={styles.featuredButtons}>
            <FocusButton
              title="Assistir"
              icon="play"
              onPress={() => onNavigate('Player', { id: item.id })}
            />
            <FocusButton
              title="Info"
              icon="information-circle-outline"
              onPress={() => onNavigate('Info', { id: item.id })}
            />
            {showConfig && (
              <FocusButton
                title="Configurações"
                icon="settings-outline"
                onPress={() => onNavigate('Settings')}
              />
            )}
          </View>
        </View>
      </ImageBackground>
    </View>
  );
});

const CategoryRow = memo(({ title, data, type, onMoviePress, onLoadMore, hasMore, loadingMore, rowIndex, onFocusChange }) => {
  const flashListRef = useRef(null);
  const carouselRef = useRef(null);

  const renderCarouselItem = useCallback(({ item }) => (
    <View style={styles.carouselItem}>
      <MovieCard
        item={item}
        onPress={onMoviePress}
        isCarousel
        style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      />
    </View>
  ), [onMoviePress]);

  const renderGridItem = useCallback(({ item }) => (
    <View style={styles.gridItem}>
      <MovieCard
        item={item}
        onPress={onMoviePress}
        isGrid
        style={{ width: GRID_ITEM_WIDTH, height: GRID_ITEM_HEIGHT }}
      />
    </View>
  ), [onMoviePress]);

  if (!data?.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {type === 'grid' ? (
        <FlashList
          data={data}
          renderItem={renderGridItem}
          estimatedItemSize={GRID_ITEM_HEIGHT + 20}
          numColumns={GRID_COLUMNS}
          key={`grid-${GRID_COLUMNS}`}
          contentContainerStyle={styles.gridContent}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View>
          <FlashList
            ref={(ref) => {
              flashListRef.current = ref;
              carouselRef.current = ref;
            }}
            data={data}
            renderItem={renderCarouselItem}
            estimatedItemSize={CARD_HEIGHT}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
            onEndReached={onLoadMore}
            onEndReachedThreshold={0.5}
          />
          {IS_TV && (
            <FocusGuideRow
              rowIndex={rowIndex}
              onNextRow={() => onFocusChange?.(rowIndex + 1, 0)}
            />
          )}
        </View>
      )}
      {loadingMore && (
        <Text style={styles.loadingMore}>Carregando mais...</Text>
      )}
      {!loadingMore && hasMore && data.length >= 10 && (
        <Text style={styles.loadHint}>Deslize para carregar mais</Text>
      )}
    </View>
  );
});

const HomeScreen = () => {
  const navigation = useNavigation();
  const { user, userInterests, appMode } = useAppContext();
  const insets = useSafeAreaInsets();
  const fuseRef = useRef(null);
  const [showFloatingCoin, setShowFloatingCoin] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const [featured, setFeatured] = useState(null);
  const [sections, setSections] = useState({});
  const [recommendedVideos, setRecommendedVideos] = useState([]);
  const [fuseReady, setFuseReady] = useState(false);

  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  
  // Estados de busca
  const [showSearch, setShowSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const handleSearch = useCallback(async (query) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    
    try {
      const results = await searchVideos(query, 20);
      setSearchResults(results.videos || []);
    } catch (error) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
  }, []);

  const openSearchScreen = useCallback(() => {
    setShowSearch(true);
  }, []);

  const handleNavPress = useCallback((route) => {
    if (route === 'Home') return;
    navigation.navigate(route);
  }, [navigation]);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  useAuth(navigation);

const loadInitialData = useCallback(async () => {
    if (!user) return;
    if (isLoadingData) return;
    
    setIsLoadingData(true);
    
    try {
      // 1. Buscar Featured (carrossel com 5 filmes aleatórios)
      const featuredRes = await getFeaturedVideos(5);
      if (featuredRes?.videos?.length > 0) {
        setFeatured(featuredRes.videos); // Array com múltiplos filmes
      }

      // 2. Buscar Recomendações (baseado nos interesses)
      let recommendationsSection = null;
      try {
        const recRes = await api.get('/api/videos/recommendations', { params: { limit: 12 } });
        if (recRes.data?.videos?.length > 0) {
          recommendationsSection = {
            name: 'recomendacoes',
            displayName: 'Talvez você possa gostar',
            videos: recRes.data.videos,
            nextCursor: null,
            hasMore: false,
            loadingMore: false
          };
        }
      } catch (e) {
        // Silencioso - não bloqueia o app
      }

      // 3. Buscar categorias do banco de dados (sem carregar vídeos ainda)
      let categories = [];
      try {
        const categoriesRes = await getCategories();
        categories = categoriesRes?.categories || [];
        console.log('Categorias do Firebase:', categories.map(c => c.key).join(', '));
      } catch (e) {
        console.log('Erro ao buscar categorias:', e.message);
      }
      
      // Não carregar todos os vídeos de uma vez - carregar primeira página de cada categoria
      const categorySections = {};
      for (const cat of categories) {
        try {
          const catRes = await getVideosByCategory(cat.key, { limit: 12 });
          categorySections[cat.displayName] = {
            name: cat.key,
            displayName: cat.displayName,
            videos: catRes.videos || [],
            nextCursor: catRes.nextCursor,
            hasMore: catRes.hasMore,
            loadingMore: false,
            loaded: true
          };
        } catch (e) {
          categorySections[cat.displayName] = {
            name: cat.key,
            displayName: cat.displayName,
            videos: [],
            nextCursor: null,
            hasMore: false,
            loadingMore: false,
            loaded: true
          };
        }
      }

      // 4. Buscar Geral (todos os vídeos)
      let geralSection = null;
      try {
        const geralRes = await getVideosFeed({ limit: 15 });
        if (geralRes?.videos?.length > 0) {
          geralSection = {
            name: 'geral',
            displayName: 'Geral',
            videos: geralRes.videos,
            nextCursor: geralRes.nextCursor,
            hasMore: geralRes.hasMore,
            loadingMore: false
          };
          
          // Criar índice Fuse com os vídeos do Geral para recomendações
          fuseRef.current = new Fuse(geralRes.videos, {
            keys: [
              { name: 'title', weight: 0.2 },
              { name: 'tipo', weight: 0.5 },
              { name: 'genero', weight: 0.3 }
            ],
            threshold: 0.6,
            includeScore: true,
            minMatchCharLength: 1
          });
          setFuseReady(true);
          
          // Buscar recomendações baseadas nos interesses do usuário
          if (userInterests?.length > 0 && fuseRef.current) {
            const interestResults = [];
            for (const interest of userInterests) {
              const results = fuseRef.current.search(interest, { limit: 8 });
              results.forEach(r => {
                if (!interestResults.find(v => v.id === r.item.id)) {
                  interestResults.push(r.item);
                }
              });
            }
            setRecommendedVideos(interestResults.slice(0, 10));
          }
        }
      } catch (e) {
        console.log('Erro ao carregar Geral:', e.message);
      }

// Montar seções na ordem correta
      const newSections = {};
      
      // Recomendações primeiro (se existirem)
      if (recommendationsSection) {
        newSections['Talvez você pode gostar'] = recommendationsSection;
      }
      
      // Categorias do banco
      Object.keys(categorySections).forEach(key => {
        newSections[key] = categorySections[key];
      });
      
      // Geral por último
      if (geralSection) {
        newSections['Geral'] = geralSection;
      }

      setSections(newSections);
      
      setInitialLoadComplete(true);
    } catch (error) {
      // Silencioso
    } finally {
      setIsLoadingData(false);
    }
  }, [user, isLoadingData]);

  useEffect(() => {
    if (user && !initialLoadComplete) {
      loadInitialData();
    }
  }, [user, initialLoadComplete, loadInitialData]);

  // Recalcular recomendações quando userInterests mudar
  useEffect(() => {
    if (userInterests?.length > 0 && fuseReady && sections['Geral']?.videos?.length > 0) {
      // Recriar fuse com as novas configurações
      const fuse = new Fuse(sections['Geral'].videos, {
        keys: [
          { name: 'title', weight: 0.2 },
          { name: 'tipo', weight: 0.5 },
          { name: 'genero', weight: 0.3 }
        ],
        threshold: 0.6,
        includeScore: true,
        minMatchCharLength: 1
      });
      const interestResults = [];
      for (const interest of userInterests) {
        const results = fuse.search(interest, { limit: 8 });
        results.forEach(r => {
          if (!interestResults.find(v => v.id === r.item.id)) {
            interestResults.push(r.item);
          }
        });
      }
      setRecommendedVideos(interestResults.slice(0, 10));
    }
  }, [userInterests, fuseReady, sections['Geral']]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setSections({});
    setFeatured(null);
    setInitialLoadComplete(false);
    await loadInitialData();
    setRefreshing(false);
  }, [loadInitialData]);

  const loadMoreCategory = useCallback(async (categoryDisplayName) => {
    const section = sections[categoryDisplayName];
    if (!section || !section.hasMore || section.loadingMore) return;

    setSections(prev => ({
      ...prev,
      [categoryDisplayName]: { ...prev[categoryDisplayName], loadingMore: true }
    }));

    try {
      let res;
      
      // Seção "Talvez você possa gostar" - usa recomendações
      if (section.name === 'recomendacoes') {
        const recRes = await api.get('/api/videos/recommendations', { params: { limit: 12, cursor: section.nextCursor } });
        res = { videos: recRes.data?.videos || [], hasMore: false, nextCursor: null };
      }
      // Seção "Geral" - usa feed geral
      else if (section.name === 'geral') {
        res = await getVideosFeed({ limit: 12, cursor: section.nextCursor });
      }
      // Outras seções - usam categorias
      else {
        const dbKey = section.name || categoryDisplayName;
        res = await getVideosByCategory(dbKey, { limit: 12, cursor: section.nextCursor });
      }

      setSections(prev => ({
        ...prev,
        [categoryDisplayName]: {
          ...prev[categoryDisplayName],
          videos: [...(prev[categoryDisplayName].videos || []), ...(res.videos || [])],
          nextCursor: res.nextCursor,
          hasMore: res.hasMore,
          loadingMore: false
        }
      }));
    } catch (error) {
      console.error('Erro ao carregar mais:', error);
      setSections(prev => ({
        ...prev,
        [categoryDisplayName]: { ...prev[categoryDisplayName], loadingMore: false }
      }));
    }
  }, [sections]);

  const navigate = useCallback((screen, params) => {
    navigation.navigate(screen, params);
  }, [navigation]);

  const onMoviePress = useCallback((movie) => {
    navigation.navigate('Info', { id: movie.id });
  }, [navigation]);

const listData = useMemo(() => {
    const data = [];
    
    // Se tiver featured (único ou múltiplos), usar FeaturedCarousel
    if (featured) {
      data.push({ type: 'featured', key: 'featured', data: featured });
    }
    
    // Seção "Você pode gosta" após Featured - baseada nos interesses do usuário via Fuse
    if (recommendedVideos.length > 0) {
      data.push({
        type: 'section',
        key: 'voce_pode_gostar',
        title: 'Você pode gostar',
        data: recommendedVideos,
        hasMore: false,
        loadingMore: false
      });
    }
    
    // Demais categorias (exceto Geral e recomendações)
    Object.keys(sections).forEach(key => {
      if (key !== 'Talvez você possa gostar' && key !== 'Geral') {
        const section = sections[key];
        if (section?.videos?.length > 0) {
          data.push({
            type: 'section',
            key: key,
            title: key,
            data: section.videos,
            hasMore: section.hasMore,
            loadingMore: section.loadingMore
          });
        }
      }
    });
    
    // Seção "Geral" - por último como grid
    if (sections['Geral']) {
      data.push({
        type: 'grid',
        key: 'Geral',
        title: 'Geral',
        data: sections['Geral'].videos,
        hasMore: sections['Geral'].hasMore,
        loadingMore: sections['Geral'].loadingMore
      });
    }
    
    return data;
  }, [featured, sections]);

  const renderItem = useCallback(({ item }) => {
    const showConfig = appMode === 'tv';
    
    if (item.type === 'featured') {
      return <FeaturedCarousel items={item.data} onNavigate={navigate} showConfig={showConfig} />;
    }
    
    const sectionType = item.type === 'grid' ? 'grid' : 'carousel';
    
    return (
      <CategoryRow>
         title={item.title}
        data={item.data}
        type={sectionType}
        onMoviePress={onMoviePress}
        onLoadMore={() => loadMoreCategory(item.title)}
        hasMore={item.hasMore}
        loadingMore={item.loadingMore}
      />
    );
  }, [navigate, onMoviePress, loadMoreCategory, appMode]);

  const renderSkeleton = useCallback(() => (
    <View style={styles.skeletonContainer}>
      <SkeletonFeatured />
      <SkeletonCarousel count={4} />
      <SkeletonCarousel count={4} />
    </View>
  ), []);

  const showSkeleton = isLoadingData || !initialLoadComplete;
  
  if (showSkeleton) {
    return (
      <View style={styles.container}>
        {renderSkeleton()}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Button */}
      <TouchableOpacity style={styles.searchIconBtn} onPress={openSearchScreen}>
        <Ionicons name="search" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Search Overlay Premium */}
      <SearchOverlay
        visible={showSearch}
        onClose={closeSearch}
        query={searchQuery}
        onChangeText={(text) => {
          setSearchQuery(text);
          handleSearch(text);
        }}
        results={searchResults}
        isSearching={isSearching}
        onResultPress={(movie) => {
          closeSearch();
          navigation.navigate('Info', { id: movie.id });
        }}
      />

      {/* Home normal (FlashList) */}
      {!showSearch && (
        <View style={styles.contentWrapper}>
          <FlashList
            data={listData}
            renderItem={renderItem}
            estimatedItemSize={400}
            keyExtractor={(item) => item.key}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.cyber.primary}
                colors={[colors.cyber.primary]}
              />
            }
            ListHeaderComponent={<View style={styles.flashListPadding} />}
            contentContainerStyle={styles.flashListContent}
          />
        </View>
      )}

      {!Platform.isTV && (
        <BottomNavBar
          currentRoute="Home"
          onNavigate={handleNavPress}
          style={styles.bottomNav}
        />
      )}

      <FloatingCoin
        visible={showFloatingCoin}
        coinsEarnedToday={0}
        onPress={() => navigation.navigate('Earn')}
        onClose={() => setShowFloatingCoin(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cyber.black,
  },
  contentWrapper: {
    flex: 1,
  },
  skeletonContainer: {
    flex: 1,
  },
  featuredContainer: {
    height: IS_TV ? 280 : 400,
  },
  featuredWrapper: {
    flex: 1,
  },
  featuredBg: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  featuredGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  featuredContent: {
    padding: 20,
  },
  featuredTitle: {
    color: 'white',
    fontSize: IS_TV ? 20 : 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  featuredSynopsis: {
    color: '#aaa',
    marginVertical: 6,
    fontSize: IS_TV ? 12 : 14,
    lineHeight: IS_TV ? 16 : 20,
  },
  featuredButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  featuredIndicators: {
    position: 'absolute',
    bottom: 15,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  indicatorActive: {
    backgroundColor: 'white',
    width: 24,
  },
  section: {
    marginBottom: 24,
    minHeight: GRID_ITEM_HEIGHT + 50,
  },
  sectionTitle: {
    color: 'white',
    fontSize: IS_TV ? 16 : 20,
    fontWeight: 'bold',
    marginBottom: 10,
    paddingHorizontal: IS_TV ? 16 : 20,
  },
  focusGuideRow: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    marginTop: 4,
  },
  focusGuideContent: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  focusGuideText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  carouselContent: {
    paddingHorizontal: IS_TV ? 16 : 20,
    gap: IS_TV ? 10 : 16,
  },
  carouselItem: {
    marginRight: 16,
  },
  gridContent: {
    paddingHorizontal: IS_TV ? 16 : 20,
    gap: IS_TV ? 12 : 20,
    paddingTop: 8,
  },
  gridItem: {
    marginRight: IS_TV ? 12 : 20,
    marginBottom: IS_TV ? 12 : 20,
  },
  loadingMore: {
    color: colors.cyber.primary,
    textAlign: 'center',
    padding: 8,
    fontSize: 12,
  },
  loadHint: {
    color: '#555',
    textAlign: 'center',
    fontSize: 11,
    paddingBottom: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
  },
  searchIconBtn: {
    position: 'absolute',
    top: 50,
    right: 16,
    zIndex: 100,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 22,
  },
});

export default HomeScreen;
  
     
