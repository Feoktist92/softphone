$(document).ready(function () {
    // Создаем сокет
    var socket = new JsSIP.WebSocketInterface('wss://voip.uiscom.ru');
    //Добавляем мелодию
    var incomingCallAudio = new window.Audio('./melody.mp3');
    incomingCallAudio.loop = true;
    incomingCallAudio.crossOrigin = "anonymous";
    var remoteAudio = new window.Audio();
    remoteAudio.autoplay = true;
    remoteAudio.crossOrigin = "anonymous";
    // Устанавливаем опции для звонков
    var callOptions = {
        mediaConstraints: { audio: true, video: false }
    };
    // Создаем конфигурацию SIP-клиента
    var configuration = {
        sockets: [socket],
        'uri': '',
        'password': '',
        'username': '',
        'register': false
    };
    // Переменные для jssip
    var phone;
    var session;
    // Переменные для дат
    var callStartTime;
    var callEndTime;
    // Переменные для таймера
    var callTimer;
    var registrationTimeout; // таймер для стирания надписи в момент регистрации
    // Загружаем данные из localStorage
    var callLog = JSON.parse(localStorage.getItem('callLog')) || [];


    // Функция для обновления журнала звонков
    function updateCallLog() {
        if (phone && phone.isRegistered()) {
            var logHtml = '<h3>Журнал звонков</h3>';
            callLog.forEach((callInfo) => {
                var startTime = new Date(callInfo.startTime);
                logHtml += `<p class="${callInfo.direction === 'incoming' ? 'incoming' : 'outgoing'}">${callInfo.direction} от ${callInfo.caller} в ${startTime.toLocaleString()}, ${Math.round(callInfo.duration)} сек</p>`;
            });
            $('#callLog').html(logHtml).show(); // Показываем журнал звонков после успешной регистрации
        } else {
            $('#callLog').hide(); // Скрываем журнал звонков, если регистрация не прошла успешно
        }
    }
    // Показать надпись об успешной или неуспешной регистрации на несколько секунд
    function showRegistrationStatus(message, timeout) {
        clearTimeout(registrationTimeout);
        $('#registerStatus').text(message);

        // Скрыть сообщение через несколько секунд
        registrationTimeout = setTimeout(function () {
            $('#registerStatus').text('');
        }, timeout);
    }
    // Функция для запуска таймера
    function startCallTimer() {
        var callDurationSeconds = 0;
        var callDurationElement = $('#callDurationValue');

        function updateCallDuration() {
            callDurationElement.text(++callDurationSeconds + ' сек');
        }
        callTimer = setInterval(updateCallDuration, 1000);
    }
    // Функция для остановки таймера
    function stopAndResetTimer() {
        clearInterval(callTimer);
        $('#callDurationValue').text('');
    }
    // Функция для проверки полей ввода
    function checkFieldsAndActivateButton() {
        var username = $('#username').val().trim();
        var password = $('#password').val().trim();
        var server = $('#server').val().trim();

        if (username !== '' && password !== '' && server !== '') {
            $('#registerBtn').prop('disabled', false);
        } else {
            $('#registerBtn').prop('disabled', true);
        }
    }
    // Функиця для обработки нажатия кнопки регистрации
    function handleRegisterBtnClick() {
        var username = $('#username').val().trim();
        var password = $('#password').val().trim();
        var server = $('#server').val().trim();


        if (phone) {
            phone.stop();  // Останавливаем текущий экземпляр JsSIP.UA
            phone = null;
        }

        // Изменяем конфигурацию SIP-клиента
        configuration.uri = 'sip:' + username + '@' + server;
        configuration.password = password;
        configuration.username = username;
        configuration.register = true;

        // Пытаемся зарегистрировать пользователя
        JsSIP.debug.enable('JsSIP:*');
        phone = new JsSIP.UA(configuration);

        phone.on('registrationExpiring', function () {
            showRegistrationStatus('Регистрация истекает...', 4000);
            updateUI();
        });

        phone.on('registered', function () {
            showRegistrationStatus('Регистрация прошла успешно!', 2000);

            updateUI();
        });

        phone.on('registrationFailed', function (ev) {
            showRegistrationStatus('Регистрация не удалась: ' + ev.cause, 4000);
            updateUI();
        });

        phone.on('newRTCSession', function (ev) {
            var newSession = ev.session;

            if (session) {
                session.terminate();
            }
            session = newSession;
            var completeSession = function () {
                session = null;
                updateUI();
            };
            session.on('ended', function () {
                callEndTime = new Date();
                var callDuration = (callEndTime - callStartTime) / 1000;
                var callInfo = {
                    startTime: callStartTime.getTime(),
                    endTime: callEndTime.getTime(),
                    duration: callDuration,
                    direction: session.direction,
                    caller: session.remote_identity.uri.user
                };
                callLog.push(callInfo);
                localStorage.setItem('callLog', JSON.stringify(callLog));
                completeSession();
            });
            session.on('failed', completeSession);
            session.on('accepted', updateUI);
            session.on('confirmed', function () {
                callStartTime = new Date();

                var localStream = session.connection.getLocalStreams()[0];
                var dtmfSender = session.connection.createDTMFSender(localStream.getAudioTracks()[0])
                session.sendDTMF = function (tone) {
                    dtmfSender.insertDTMF(tone);
                };
                stopAndResetTimer(); // Остановить и сбросить предыдущий таймер
                startCallTimer();
            });
            session.on('peerconnection', (e) => {
                console.log('peerconnection', e);
                let logError = '';
                const peerconnection = e.peerconnection;

                peerconnection.onaddstream = function (e) {
                    console.log('addstream', e);
                    remoteAudio.srcObject = e.stream;
                    remoteAudio.play();
                };

                var remoteStream = new MediaStream();
                console.log(peerconnection.getReceivers());
                peerconnection.getReceivers().forEach(function (receiver) {
                    console.log(receiver);
                    remoteStream.addTrack(receiver.track);
                });
            });

            if (session.direction === 'incoming') {
                incomingCallAudio.play();
            } else {
                console.log('con', session.connection)
                session.connection.addEventListener('addstream', function (e) {
                    incomingCallAudio.pause();
                    remoteAudio.srcObject = e.stream;
                });
            }
            updateUI();
        });
        phone.start();
        updateUI();
    }
    // Функция для обновления интерфейса
    function updateUI() {
        $('#wrapper').show();
        if (session) {
            if (session.isInProgress()) {
                if (session.direction === 'incoming') {
                    $('#incomingCallNumber').text(`от ${session.remote_identity.uri.user}`);
                    $('#incomingCall').show();
                    $('#callControl').hide();
                } else {
                    $('#callInfoText').text('Звонок...');
                    $('#callInfoNumber').text(session.remote_identity.uri.user);
                    $('#callStatus').show();
                }

            } else if (session.isEstablished()) {
                $('#callStatus').show();
                $('#incomingCall').hide();
                $('#callInfoText').html('Идет разговор...');
                $('#callInfoNumber').html(session.remote_identity.uri.user);
                $('#inCallButtons').show();
                incomingCallAudio.pause();
            }
            $('#callControl').hide();
        } else {
            $('#incomingCall').hide();
            $('#callControl').show();
            $('#callStatus').hide();
            $('#inCallButtons').hide();
            incomingCallAudio.pause();
        }
        //microphone mute icon
        if (session && session.isMuted().audio) {
            $('#muteIcon').addClass('fa-microphone-slash');
            $('#muteIcon').removeClass('fa-microphone');
        } else {
            $('#muteIcon').removeClass('fa-microphone-slash');
            $('#muteIcon').addClass('fa-microphone');
        }
        updateCallLog();
    }

    // Делаем не активной кнопку регистрации по умолчанию
    $('#registerBtn').prop('disabled', true);
    // Обработчик ввода данных в поля ввода
    $('#username, #password, #server').on('input', checkFieldsAndActivateButton);
    // Запрещаем ввод кириллицы
    $('#username, #password, #server').keypress(function (e) {
        var key = e.charCode || e.keyCode || 0;
        if (key >= 1040 && key <= 1103) {
            e.preventDefault();
            showRegistrationStatus('Кириллица не поддерживается', 1000);
            updateUI();
        }
    });
    // Обработчик нажатия кнопки регистрации
    $('#registerBtn').click(handleRegisterBtnClick);
    // Обработчик нажатия кнопки вызова
    $('#connectCall').click(() => {
        stopAndResetTimer();
        var dest = $('#toField').val();
        callStartTime = new Date();
        phone.call(dest, callOptions);
        updateUI();
    });
    // Обработчик нажатия кнопки ответа
    $('#answer').click(() => {
        session.answer(callOptions);
    });
    // Обработчик нажатия кнопки разрыва
    var hangup = function () {
        session.terminate();
    };
    $('#hangUp').click(hangup);
    $('#reject').click(hangup);

    // Обработчик нажатия кнопки микрофона
    $('#mute').click(() => {
        console.log('MUTE CLICKED');
        if (session.isMuted().audio) {
            session.unmute({ audio: true });
        } else {
            session.mute({ audio: true });
        }
        updateUI();
    });
    // Обработчик нажатия Enter в поле ввода
    $('#toField').keypress(function (e) {
        if (e.which === 13) {
            $('#connectCall').click();
        }
    });
});
