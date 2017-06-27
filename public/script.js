$(document).ready(() => {
    //Signature canvas
    let canvas = document.getElementById("canvas");
    let context = canvas.getContext("2d");

    $(canvas).on("mousedown", (e) => {
        context.beginPath();
        context.moveTo(e.offsetX, e.offsetY);
        $(canvas).on("mousemove", draw);
    });

    $(document).on("mouseup", () => {
        $(canvas).off("mousemove", draw);
        $("#signature").val(canvas.toDataURL());
    });

    function draw(e) {
        context.lineTo(e.offsetX, e.offsetY);
        context.stroke();
    }

    $("#clear").on("click", () => {//clear signature button
        context.clearRect(0, 0, canvas.width, canvas.height);
    });
});
