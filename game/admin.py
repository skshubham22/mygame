from django.contrib import admin
from .models import Room

@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ('code', 'game_type', 'is_active', 'created_at')
    list_filter = ('game_type', 'is_active')
    search_fields = ('code',)
    readonly_fields = ('created_at',)
