from django.shortcuts import render, redirect
from .models import Room

def index(request):
    if not request.session.session_key:
        request.session.create()

    if request.method == 'POST':
        player_name = request.POST.get('player_name')
        if player_name:
            request.session['player_name'] = player_name
            
        action = request.POST.get('action')
        
        if action == 'join':
            room_code = request.POST.get('room_code')
            try:
                room = Room.objects.get(code=room_code)
                if room.is_expired:
                    return render(request, 'game/index.html', {'error': 'Room code expired (valid for 5 mins)'})
                return redirect('room', room_code=room.code)
            except Room.DoesNotExist:
                return render(request, 'game/index.html', {'error': 'Room not found'})
                
        elif action == 'create':
            game_type = request.POST.get('game_type', 'TIC_TAC_TOE')
            room = Room.objects.create(game_type=game_type)
            return redirect('room', room_code=room.code)
            
    return render(request, 'game/index.html')

def room(request, room_code):
    try:
        room = Room.objects.get(code=room_code)
        return render(request, 'game/room.html', {
            'room_code': room_code,
            'game_type': room.game_type
        })
    except Room.DoesNotExist:
        return redirect('index')
