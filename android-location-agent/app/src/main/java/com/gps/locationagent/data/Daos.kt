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

@Dao
interface PendingPointDao {
    @Insert
    suspend fun insert(point: PendingPoint)

    /** Oudste punten eerst — beperkt aantal per flush-tick. */
    @Query("SELECT * FROM pending_points ORDER BY id ASC LIMIT :limit")
    suspend fun oldest(limit: Int): List<PendingPoint>

    @Query("DELETE FROM pending_points WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<Long>)

    @Query("SELECT COUNT(*) FROM pending_points")
    suspend fun count(): Int

    /** Afval-veiligheid: queue nooit onbegrensd laten groeien. */
    @Query("DELETE FROM pending_points WHERE id NOT IN (SELECT id FROM pending_points ORDER BY id DESC LIMIT :keep)")
    suspend fun trim(keep: Int)
}
