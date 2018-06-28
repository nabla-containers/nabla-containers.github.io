// Adapted from https://gist.github.com/SimplGy/a229d25cdb19d7f21231
(function(){
    'use strict';

    var headingNodes = [], results, link,
        tags = ['h2', 'h3', 'h4', 'h5', 'h6'];
    var posts = document.getElementsByClassName("post")
    if (posts.length == 1) {
      var post = posts[0]
      tags.forEach(function(tag){
        results = post.getElementsByTagName(tag);
        Array.prototype.push.apply(headingNodes, results);
      });

      headingNodes.forEach(function(node){
        link = document.createElement('a');
        link.className = 'deep-link';
        link.textContent = '[link]'
        link.href = '#' + node.getAttribute('id');
        node.appendChild(link);
      });
    }
  })();
