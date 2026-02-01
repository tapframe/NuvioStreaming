package com.nuvio.tv.di

import com.nuvio.tv.core.plugin.PluginManager
import com.nuvio.tv.core.plugin.PluginRuntime
import com.nuvio.tv.data.local.PluginDataStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object PluginModule {
    
    @Provides
    @Singleton
    fun providePluginRuntime(): PluginRuntime {
        return PluginRuntime()
    }
    
    @Provides
    @Singleton
    fun providePluginManager(
        dataStore: PluginDataStore,
        runtime: PluginRuntime
    ): PluginManager {
        return PluginManager(dataStore, runtime)
    }
}
