package com.gps.locationagent.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface ApiConfigDao {
    @Query("SELECT * FROM api_configs ORDER BY name ASC")
    fun observeAll(): Flow<List<ApiConfig>>

    @Query("SELECT * FROM api_configs WHERE enabled = 1")
    suspend fun getEnabled(): List<ApiConfig>

    @Query("SELECT * FROM api_configs WHERE id = :id")
    suspend fun getById(id: Long): ApiConfig?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(config: ApiConfig): Long

    @Update
    suspend fun update(config: ApiConfig)

    @Delete
    suspend fun delete(config: ApiConfig)

    @Query("UPDATE api_configs SET enabled = :enabled, updatedAt = :now WHERE id = :id")
    suspend fun setEnabled(id: Long, enabled: Boolean, now: Long = System.currentTimeMillis())
}

@Dao
interface LogDao {
    @Query("SELECT * FROM log_entries ORDER BY id DESC LIMIT 500")
    fun observeRecent(): Flow<List<LogEntry>>

    @Insert
    suspend fun insert(entry: LogEntry)

    @Query("DELETE FROM log_entries")
    suspend fun clear()
}
