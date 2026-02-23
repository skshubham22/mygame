from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('room/<str:room_code>/', views.room, name='room'),
    path('debug-save/', views.debug_save_chat, name='debug_save'),
]
