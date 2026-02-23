from django.contrib import admin
from .models import Room, ChatLog

@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ('code', 'game_type', 'is_active', 'created_at')
    list_filter = ('game_type', 'is_active')
    search_fields = ('code',)
    readonly_fields = ('created_at',)

@admin.register(ChatLog)
class ChatLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'room', 'sender', 'message')
    list_filter = ('room', 'sender', 'timestamp')
    search_fields = ('message', 'sender')
    readonly_fields = ('timestamp',)
