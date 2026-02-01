package com.nuvio.tv.core.di

import com.nuvio.tv.data.repository.AddonRepositoryImpl
import com.nuvio.tv.data.repository.CatalogRepositoryImpl
import com.nuvio.tv.data.repository.MetaRepositoryImpl
import com.nuvio.tv.data.repository.StreamRepositoryImpl
import com.nuvio.tv.data.repository.WatchProgressRepositoryImpl
import com.nuvio.tv.domain.repository.AddonRepository
import com.nuvio.tv.domain.repository.CatalogRepository
import com.nuvio.tv.domain.repository.MetaRepository
import com.nuvio.tv.domain.repository.StreamRepository
import com.nuvio.tv.domain.repository.WatchProgressRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindAddonRepository(impl: AddonRepositoryImpl): AddonRepository

    @Binds
    @Singleton
    abstract fun bindCatalogRepository(impl: CatalogRepositoryImpl): CatalogRepository

    @Binds
    @Singleton
    abstract fun bindMetaRepository(impl: MetaRepositoryImpl): MetaRepository

    @Binds
    @Singleton
    abstract fun bindStreamRepository(impl: StreamRepositoryImpl): StreamRepository

    @Binds
    @Singleton
    abstract fun bindWatchProgressRepository(impl: WatchProgressRepositoryImpl): WatchProgressRepository
}
